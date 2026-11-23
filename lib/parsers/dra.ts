import type { Sheet } from "./androidXlsx";
import type { DraPack } from "@/types/dra";

const s = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const n = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  const t = s(v).replace(/[^\d-]/g, "");
  return t && t !== "-" ? Number(t) : 0;
};
const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };

/** "MZA DRA Y27Q1W8 as of minggu 22 nov 2026 V1.xlsx" → week "Y27Q1W8", asOf "2026-11-22". */
export function draFileInfo(fileName: string): { week: string; asOf: string | null } {
  const f = fileName.replace(/[_]+/g, " ");
  const week = f.match(/\bY\d{2}Q\d+W\d+\b/i)?.[0].toUpperCase() ?? "";
  const m = f.match(/as of\s+(?:[a-z]+\s+)?(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})/i);
  const mon = m ? MON[m[2].toLowerCase()] : undefined;
  const asOf = m && mon ? `${m[3]}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
  return { week, asOf };
}

const headIdx = (row: unknown[], name: string) => row.findIndex((c) => s(c).toLowerCase() === name.toLowerCase());
const sheetOf = (sheets: Sheet[], name: string) => sheets.find((x) => s(x.name).toLowerCase() === name);

/** The DRA workbook has a store × article sheet for Apple and for Android (header "New Site · … · Sales qty · Stk OnHand"). */
export function isDraWorkbook(sheets: Sheet[]): boolean {
  return ["apple by article", "android by article"].some((nm) => {
    const h = sheetOf(sheets, nm)?.rows[0] ?? [];
    return headIdx(h, "New Site") >= 0 && headIdx(h, "Sales qty") >= 0 && headIdx(h, "Stk OnHand") >= 0;
  });
}

/**
 * Packs the DRA workbook: sheets "apple by article" and "android by article" (one line per store × article),
 * plus "by article" (Apple network totals) for the Apple articles that have no per-store lines (accessories).
 * Lines with no sales and no stock are dropped.
 */
export function parseDraWorkbook(sheets: Sheet[], fileName: string): DraPack {
  const sites: string[] = [];
  const siteIdx = new Map<string, number>();
  const arts: DraPack["arts"] = [];
  const artIdx = new Map<string, number>();
  const rows: number[] = [];
  const site = (name: string) => {
    let i = siteIdx.get(name);
    if (i === undefined) siteIdx.set(name, (i = sites.push(name) - 1));
    return i;
  };
  const art = (a: string, desc: string, sub: string, brand: string, kind: 0 | 1) => {
    let i = artIdx.get(a);
    if (i === undefined) artIdx.set(a, (i = arts.push([a, desc, sub, brand, kind]) - 1));
    else {
      const x = arts[i];
      if (!x[1] && desc) x[1] = desc;
      if (!x[2] && sub) x[2] = sub;
    }
    return i;
  };
  const perStore = new Set<string>();
  for (const [nm, kind] of [["apple by article", 0], ["android by article", 1]] as const) {
    const sh = sheetOf(sheets, nm);
    if (!sh?.rows.length) continue;
    const h = sh.rows[0];
    const c = { site: headIdx(h, "New Site"), brand: headIdx(h, "BRAND"), art: headIdx(h, "Article"), desc: headIdx(h, "Article Description"), sub: headIdx(h, "Detailed Category (Sub-LOB)"), q: headIdx(h, "Sales qty"), k: headIdx(h, "Stk OnHand") };
    if (c.site < 0 || c.art < 0 || c.q < 0 || c.k < 0) throw new Error(`Sheet "${sh.name}": kolom New Site / Article / Sales qty / Stk OnHand tidak ditemukan`);
    for (let r = 1; r < sh.rows.length; r++) {
      const row = sh.rows[r] ?? [];
      const a = s(row[c.art]).toUpperCase();
      const st = s(row[c.site]);
      if (!a || !st) continue;
      const q = n(row[c.q]);
      const k = n(row[c.k]);
      const brand = kind === 0 ? "APPLE" : c.brand >= 0 ? s(row[c.brand]).toUpperCase() : "";
      const ai = art(a, s(row[c.desc]), s(row[c.sub]), brand, kind);
      perStore.add(a);
      if (q || k) rows.push(site(st), ai, q, k);
    }
  }
  // "by article": Apple totals for the whole network — only articles without per-store lines (bands, cases, …)
  const tot = sheetOf(sheets, "by article");
  if (tot?.rows.length) {
    const h = tot.rows[0];
    const c = { art: headIdx(h, "Article"), sub: headIdx(h, "Detailed Category (Sub-LOB)"), q: headIdx(h, "Sales qty"), k: headIdx(h, "Stk OnHand") };
    if (c.art >= 0 && c.q >= 0 && c.k >= 0) {
      for (let r = 1; r < tot.rows.length; r++) {
        const row = tot.rows[r] ?? [];
        const a = s(row[c.art]).toUpperCase();
        if (!a || perStore.has(a) || /^(total|non\b|grand)/i.test(a)) continue;
        const q = n(row[c.q]);
        const k = n(row[c.k]);
        if (!q && !k) continue;
        rows.push(-1, art(a, "", s(row[c.sub]), "APPLE", 0), q, k);
      }
    }
  }
  if (!rows.length) throw new Error("Tidak ada data stok / penjualan di file ini");
  return { ...draFileInfo(fileName), source: fileName, sites, arts, rows };
}
