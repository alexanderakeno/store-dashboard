import type { PdfText } from "./soh";
import type { PriceItem, PriceKind, QoalaTier } from "@/types/pricelist";

export interface PriceListParse {
  /** ISO date printed in the title ("PRICE LIST 19 OKTOBER 2026"). */
  date: string | null;
  title: string;
  items: PriceItem[];
  qoala: QoalaTier[];
  /** Kinds present in the file — only these are replaced on import. */
  kinds: PriceKind[];
  warnings: string[];
}

export const clean = (s: string) => s.replace(/\s+/g, " ").trim();
export const isPrice = (s: string) => /^(?:Rp\s?)?\d{1,3}(?:[.,]\d{3})+$/i.test(s) || /^\d{4,}$/.test(s);
export const toNum = (s: string) => Number(s.replace(/[^\d]/g, ""));

const MONTHS: Record<string, number> = {
  JANUARI: 1, JANUARY: 1, JAN: 1, FEBRUARI: 2, FEBRUARY: 2, FEB: 2, MARET: 3, MARCH: 3, MAR: 3, APRIL: 4, APR: 4, MEI: 5, MAY: 5,
  JUNI: 6, JUNE: 6, JUN: 6, JULI: 7, JULY: 7, JUL: 7, AGUSTUS: 8, AUGUST: 8, AGU: 8, AUG: 8, SEPTEMBER: 9, SEP: 9, OKTOBER: 10, OCTOBER: 10, OKT: 10, OCT: 10,
  NOVEMBER: 11, NOV: 11, DESEMBER: 12, DECEMBER: 12, DES: 12, DEC: 12,
};

/** "19 OKTOBER 2026" or "19/10/2026" → "2026-10-19". */
export function priceListDate(s: string): string | null {
  const iso = (y: number, m: number, d: number) => (d >= 1 && d <= 31 && m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
  const a = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s);
  if (a && MONTHS[a[2].toUpperCase()]) return iso(Number(a[3]), MONTHS[a[2].toUpperCase()], Number(a[1]));
  const b = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  return b ? iso(Number(b[3]), Number(b[2]), Number(b[1])) : null;
}

const BRANDS: Array<[RegExp, string]> = [
  [/^(IPHONE|IPAD|MACBOOK|IMAC|MAC|APPLE|AIRPODS|AIRTAG)\b/, "Apple"],
  [/^(SAMSUNG|GALAXY)\b/, "Samsung"],
  [/^(HUAWEI|MATEPAD)\b/, "Huawei"],
  [/^(XIAOMI|REDMI|POCO)\b/, "Xiaomi"],
  [/^OPPO\b/, "Oppo"],
  [/^VIVO\b/, "Vivo"],
  [/^REALME\b/, "Realme"],
  [/^INFINIX\b/, "Infinix"],
  [/^TECNO\b/, "Tecno"],
  [/^(MOTOROLA|MOTO)\b/, "Motorola"],
  [/^AMAZFIT\b/, "Amazfit"],
  [/^HONOR\b/, "Honor"],
  [/^NOTHING\b/, "Nothing"],
];

/** Brand from the item name, falling back to the section title ("MATEPAD SERIES" → Huawei). */
export function brandOf(name: string, series: string): string {
  for (const s of [name, series]) {
    const u = s.toUpperCase();
    for (const [re, b] of BRANDS) if (re.test(u)) return b;
  }
  const w = (name.split(" ")[0] || series.split(" ")[0] || "Lainnya").toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Groups runs into visual rows (same baseline within ~half a line height). */
export function rows(texts: PdfText[]): PdfText[][] {
  const out: PdfText[][] = [];
  for (const t of [...texts].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = out[out.length - 1];
    const tol = Math.max(0.5, (t.h || 1) * 0.45);
    if (row && Math.abs(row[0].y - t.y) <= tol) row.push(t);
    else out.push([t]);
  }
  return out.map((r) => r.sort((a, b) => a.x - b.x));
}

interface Section {
  kind: "price" | "qoala";
  series: string;
  y: number;
  /** x-range of the block this section heads. */
  from: number;
  to: number;
  /** x of the Normal Price column (row text left of it = the item name). */
  priceX: number;
  /** Fee column headers for Qoala ("12 MONTHS" …) with their centre x. */
  tenors: Array<{ m: string; x: number }>;
}

/**
 * Parses the store price list PDF ("PRICE LIST DIGIPLUS …"): side-by-side blocks, each a series
 * title + `Normal Price · Promotion Price · Product Remarks` header followed by item rows, plus the
 * Qoala protection fee table. Layout is found from the header labels, not fixed positions.
 */
export function parsePriceListPdf(input: PdfText[]): PriceListParse {
  const texts = input.map((t) => ({ ...t, str: clean(t.str) })).filter((t) => t.str);
  const warnings: string[] = [];
  const top = texts.filter((t) => t.page === 1).sort((a, b) => b.y - a.y || a.x - b.x);
  const title = top[0]?.str ?? "";
  const date = top.slice(0, 6).map((t) => priceListDate(t.str)).find(Boolean) ?? null;

  const items: PriceItem[] = [];
  const qoala: QoalaTier[] = [];

  for (const page of [...new Set(texts.map((t) => t.page))].sort((a, b) => a - b)) {
    const onPage = texts.filter((t) => t.page === page);
    const normals = onPage.filter((t) => /^normal\s*price$/i.test(t.str));
    const remarks = onPage.filter((t) => /^product\s*remarks$/i.test(t.str));
    if (!normals.length) continue;

    // Block columns: cluster Normal Price headers by x; a block ends right after its Product Remarks column.
    const cols: Array<{ priceX: number; end: number }> = [];
    for (const n of [...normals].sort((a, b) => a.x - b.x)) {
      if (cols.some((c) => Math.abs(c.priceX - n.x) < 20)) continue;
      const r = remarks.filter((x) => x.x > n.x && Math.abs(x.y - n.y) < (n.h || 5)).sort((a, b) => a.x - b.x)[0];
      cols.push({ priceX: n.x, end: r ? r.x + r.w : n.x + 140 });
    }
    const colOf = (x: number) => cols.findIndex((c, i) => x < c.end + 4 && x >= (i ? cols[i - 1].end + 4 : -Infinity));
    const bounds = (i: number) => ({ from: i ? cols[i - 1].end + 4 : -Infinity, to: cols[i].end + 4 });

    const sections: Section[] = [];
    for (const n of normals) {
      const i = colOf(n.x);
      if (i < 0) continue;
      const { from, to } = bounds(i);
      const label = onPage
        .filter((t) => Math.abs(t.y - n.y) < (n.h || 5) * 0.6 && t.x < n.x && t.x >= from && !/price|remarks/i.test(t.str))
        .map((t) => t.str)
        .join(" ");
      sections.push({ kind: "price", series: label || "Lainnya", y: n.y, from, to, priceX: cols[i].priceX, tenors: [] });
    }
    for (const q of onPage.filter((t) => /qoala\s+protection/i.test(t.str))) {
      const i = colOf(q.x);
      if (i < 0) continue;
      const { from, to } = bounds(i);
      sections.push({ kind: "qoala", series: "Qoala Protection", y: q.y, from, to, priceX: Infinity, tenors: [] });
    }

    for (const row of rows(onPage.filter((t) => !normals.includes(t)))) {
      // split the visual row into its blocks
      const byCol = new Map<number, PdfText[]>();
      for (const t of row) {
        const i = colOf(t.x);
        if (i >= 0) byCol.set(i, [...(byCol.get(i) ?? []), t]);
      }
      for (const [i, cells] of byCol) {
        const { from } = bounds(i);
        const y = cells[0].y;
        const sec = sections.filter((s) => s.from === from && s.y > y + 0.5).sort((a, b) => a.y - b.y)[0];
        if (!sec) continue;
        const nums = cells.filter((c) => isPrice(c.str));
        const words = cells.filter((c) => !isPrice(c.str));
        if (sec.kind === "qoala") {
          const label = words.map((w) => w.str).join(" ");
          if (/months?|bulan/i.test(label) && !nums.length) {
            sec.tenors = words.filter((w) => /\d+\s*(months?|bulan)/i.test(w.str)).map((w) => ({ m: String(Number(/\d+/.exec(w.str)![0])), x: w.x + (w.w || 0) / 2 }));
            continue;
          }
          if (!nums.length || !/\//.test(label)) continue;
          const [tier, ...rest] = label.split("/");
          // a fee belongs to the tenor column it sits under — a row may leave a column empty (KLAVVIP has no 24-month fee… or no 18)
          const keyOf = (n: PdfText, k: number) => {
            if (!sec.tenors.length) return ["12", "18", "24"][k] ?? String(k);
            const c = n.x + (n.w || 0) / 2;
            return [...sec.tenors].sort((a, b) => Math.abs(a.x - c) - Math.abs(b.x - c))[0].m;
          };
          qoala.push({ tier: clean(tier), range: clean(rest.join("/")).replace(/\s*-$/, ""), fees: Object.fromEntries(nums.map((n, k) => [keyOf(n, k), toNum(n.str)])) });
          continue;
        }
        if (!nums.length) continue;
        const name = clean(words.filter((w) => w.x < sec.priceX).map((w) => w.str).join(" "));
        const status = clean(words.filter((w) => w.x >= sec.priceX).map((w) => w.str).join(" ")).toUpperCase() || "ACTIVE";
        if (!name) continue;
        const normal = toNum(nums[0].str);
        const promo = nums[1] ? toNum(nums[1].str) : normal;
        const brand = brandOf(name, sec.series);
        items.push({ kind: brand === "Apple" ? "apple" : "android", brand, series: sec.series, name, normal, promo, status });
      }
    }
  }

  dedupeItems(items, warnings);
  if (!items.length) warnings.push('Header "Normal Price / Promotion Price" tidak ditemukan — bukan PDF price list?');
  const odd = items.filter((x) => x.promo > x.normal);
  if (odd.length) warnings.push(`${odd.length} tipe harga promo lebih tinggi dari harga normal (cek PDF): ${odd.slice(0, 3).map((x) => x.name).join(", ")}${odd.length > 3 ? ", …" : ""}`);
  const kinds = [...new Set(items.map((x) => x.kind))];
  return { date, title, items, qoala, kinds, warnings };
}

/** Drops rows printed twice in the PDF (same series, name and prices) — they only doubled the variant chips. */
export function dedupeItems(items: PriceItem[], warnings: string[]): void {
  const seen = new Set<string>();
  const dup: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const x = items[i];
    const k = [x.kind, x.series, x.name, x.normal, x.promo, x.credit ?? "", x.status, x.note ?? ""].join("|").toUpperCase();
    if (!seen.has(k)) {
      seen.add(k);
      continue;
    }
    dup.push(x.name);
    items.splice(i--, 1);
  }
  if (dup.length) warnings.push(`${dup.length} baris dobel (sama persis) dilewati: ${dup.slice(0, 3).join(", ")}${dup.length > 3 ? ", …" : ""}`);
}

/** A memory/size token: "12/256GB", "8/128G", "256GB", "1TB", "44MM", "44M". */
export const isSizeToken = (t: string) => /^\d+\/\d+(?:GB|G|TB|T)?$/i.test(t) || /^\d+(?:GB|TB)$/i.test(t) || /^\d+MM?$/i.test(t);

/** Model name without the memory/size variant: "GALAXY A17 5G 8/256GB" → { model: "GALAXY A17 5G", variant: "8/256GB" }. */
export function modelOf(name: string): { model: string; variant: string } {
  const tokens = name.split(" ");
  const k = tokens.findIndex((t, i) => i > 0 && isSizeToken(t));
  if (k < 1) return { model: name, variant: "" };
  return { model: tokens.slice(0, k).join(" "), variant: tokens.slice(k).join(" ") };
}
