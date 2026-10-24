import { clean, priceListDate, type PriceListParse } from "./pricelist";
import type { PriceItem } from "@/types/pricelist";

/** One worksheet as a grid of cell values (SheetJS `sheet_to_json(ws, { header: 1 })`). */
export interface Sheet {
  name: string;
  rows: unknown[][];
}

const up = (v: unknown) => clean(String(v ?? "")).toUpperCase();
const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : NaN;
  const s = String(v ?? "").replace(/[^\d-]/g, "");
  return s ? Number(s) : NaN;
};
const BRANDS: Record<string, string> = { XIAOMI: "Xiaomi", SAMSUNG: "Samsung", HUAWEI: "Huawei", OPPO: "Oppo", INFINIX: "Infinix", MOTOROLA: "Motorola", AMAZFIT: "Amazfit", VIVO: "Vivo", REALME: "Realme", TECNO: "Tecno", HONOR: "Honor", EVOLT: "Evolt", MEDPOIN: "Medpoin" };
const brandName = (b: string) => BRANDS[b] ?? (b ? b.charAt(0) + b.slice(1).toLowerCase() : "Lainnya");

/** Header row (within the first rows) that has all `need` labels; returns column index per label. */
function header(rows: unknown[][], need: Record<string, RegExp>): { at: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] ?? []).map(up);
    const col: Record<string, number> = {};
    for (const [k, re] of Object.entries(need)) {
      const j = cells.findIndex((c) => re.test(c));
      if (j < 0) break;
      col[k] = j;
    }
    if (Object.keys(col).length === Object.keys(need).length) return { at: i, col };
  }
  return null;
}

const titleOf = (rows: unknown[][]) => rows.slice(0, 4).flat().map(up).find((c) => /PRICE\s*LIST/.test(c)) ?? "";

/** True when the workbook is the DIGIPLUS Excel price list (has the national sheet or the MASTER sheet). */
export function isAndroidPriceListXlsx(sheets: Sheet[]): boolean {
  return sheets.some((s) => /NASIONAL/i.test(s.name) || /^MASTER$/i.test(s.name.trim()));
}

/**
 * DIGIPLUS Excel price list ("PRICE LIST PROMO DIGIPLUS … - Further Notice.xlsx"):
 * - `PRICE LIST DIGIPLUS NASIONAL`: one row per article (colour) — Brand · Article · Description · Category · TYPE ·
 *   Original Price · Current Price · Pricing Remarks · … · Product Remarks. TYPE (model + memory) becomes the
 *   price-list name; the articles are kept so stock is matched by article code.
 * - `MASTER`: same data with series header rows ("REDMI 15 series") — used for the series of each article.
 * - `PRICELIST PROMO <store>`: store-only promo price / free gift for this store.
 * - `MKT COUPON TSEL`: Telkomsel coupon price, shown as a note.
 * Regional sheets (BATAM) are ignored.
 */
export function parseAndroidPriceListXlsx(sheets: Sheet[], storeCode = ""): PriceListParse {
  const warnings: string[] = [];
  const nasional = sheets.find((s) => /NASIONAL/i.test(s.name));
  const master = sheets.find((s) => /^MASTER$/i.test(s.name.trim()));

  // series per article from MASTER: a row with text in the article column and no description is a series title
  const seriesOf = new Map<string, string>();
  if (master) {
    const h = header(master.rows, { brand: /^BRAND$/, article: /ARTICLE/, desc: /DESCRIPTION/ });
    if (h) {
      let current = "";
      for (const r of master.rows.slice(h.at + 1)) {
        const brand = up(r[h.col.brand]);
        const a = up(r[h.col.article]);
        const d = up(r[h.col.desc]);
        if (a && !d) {
          // "SAMSUNG GALAXY A07 series" → "GALAXY A07 SERIES"; keep the brand when the rest is only a number / one word ("XIAOMI 15 series", "XIAOMI Pad")
          const rest = a.replace(new RegExp(`^${brand}\\s+`), "");
          current = rest !== a && /^[A-Z]/.test(rest) && rest.split(" ").length >= 2 && !/^\d/.test(rest) ? rest : a;
        }
        else if (a && d && current) seriesOf.set(a, current);
      }
    }
  }

  // the national sheet; fall back to MASTER (same columns, no TYPE → description is used)
  const src = nasional ?? master;
  const title = src ? titleOf(src.rows) : "";
  const date = priceListDate(title);
  const h = src
    ? header(src.rows, { brand: /^BRAND$/, article: /ARTICLE/, desc: /DESCRIPTION/, category: /^CATEGORY$/, original: /^ORIGINAL PRICE/, current: /^CURRENT PRICE/ })
    : null;
  if (!src || !h) {
    warnings.push('Sheet "PRICE LIST DIGIPLUS NASIONAL" / kolom ARTICLE · DESCRIPTION · CURRENT PRICE tidak ditemukan — bukan file price list DIGIPLUS?');
    return { date, title, items: [], qoala: [], kinds: [], warnings };
  }
  const cells = (src.rows[h.at] ?? []).map(up);
  const colOf = (re: RegExp) => cells.findIndex((c) => re.test(c));
  const cType = colOf(/^TYPE$/);
  const cRemark = colOf(/^PRICING REMARKS?$/);
  const cStatus = colOf(/^PRODUCT REMARKS?$/);

  // store promo (this store only) and the Telkomsel coupon, both per article
  const storePromo = new Map<string, { price: number; gift: string }>();
  const store = storeCode ? sheets.find((s) => /PROMO/i.test(s.name) && new RegExp(`\\b${storeCode}\\b`, "i").test(s.name)) : undefined;
  if (store) {
    const sh = header(store.rows, { article: /^ARTICLE$/, promo: /^PROMO PRICE$/ });
    const cGift = sh ? (store.rows[sh.at] ?? []).map(up).findIndex((c) => /FREE GIFT/.test(c)) : -1;
    if (sh)
      for (const r of store.rows.slice(sh.at + 1)) {
        const a = up(r[sh.col.article]);
        const p = num(r[sh.col.promo]);
        if (a && Number.isFinite(p) && p > 0) storePromo.set(a, { price: p, gift: cGift >= 0 ? clean(String(r[cGift] ?? "")) : "" });
      }
  }
  const coupon = new Map<string, number>();
  const tsel = sheets.find((s) => /COUPON/i.test(s.name) && /TSEL|TELKOMSEL/i.test(s.name));
  if (tsel) {
    const th = header(tsel.rows, { article: /^ARTICLE$/, promo: /^PROMO PRICE$/ });
    if (th)
      for (const r of tsel.rows.slice(th.at + 1)) {
        const a = up(r[th.col.article]);
        const p = num(r[th.col.promo]);
        if (a && Number.isFinite(p) && p > 0) coupon.set(a, p);
      }
  }

  // one price-list row per TYPE + price + status; the colours (articles) are collected on it
  const groups = new Map<string, PriceItem & { articles: string[]; notes: Set<string> }>();
  let skipped = 0;
  for (const r of src.rows.slice(h.at + 1)) {
    const article = up(r[h.col.article]);
    const desc = up(r[h.col.desc]);
    if (!article || !desc) continue;
    const normal = num(r[h.col.original]);
    let promo = num(r[h.col.current]);
    if (!Number.isFinite(normal) || !Number.isFinite(promo) || normal <= 0) {
      skipped++;
      continue;
    }
    const notes: string[] = [];
    const remark = cRemark >= 0 ? clean(String(r[cRemark] ?? "")) : "";
    if (remark && remark !== "0" && promo < normal) notes.push(remark);
    const sp = storePromo.get(article);
    if (sp) {
      if (sp.price < promo) {
        promo = sp.price;
        notes.push(`Promo toko ${storeCode}`);
      }
      if (sp.gift) notes.push(sp.gift);
    }
    const tc = coupon.get(article);
    if (tc && tc < promo) notes.push(`Kupon Telkomsel: Rp ${tc.toLocaleString("id-ID")}`);
    const status = (cStatus >= 0 ? up(r[cStatus]) : "").replace(/^0$/, "") || "ACTIVE";
    const brandRaw = up(r[h.col.brand]);
    const name = (cType >= 0 ? up(r[cType]) : "") || desc;
    const series = seriesOf.get(article) ?? up(r[h.col.category]) ?? "";
    const key = [brandRaw, name, normal, promo, status].join("|");
    const g = groups.get(key) ?? { kind: "android" as const, brand: brandName(brandRaw), series, name, normal, promo, status, articles: [], notes: new Set<string>() };
    g.articles.push(article);
    notes.forEach((n) => g.notes.add(n));
    groups.set(key, g);
  }
  const items: PriceItem[] = [...groups.values()].map(({ notes, ...it }) => ({ ...it, ...(notes.size ? { note: [...notes].join(" · ").slice(0, 400) } : {}) }));
  if (skipped) warnings.push(`${skipped} baris tanpa harga dilewati.`);
  if (!store && storeCode && sheets.some((s) => /PROMO/i.test(s.name) && /\bQ[A-Z]\d{2}\b/i.test(s.name))) warnings.push(`Tidak ada sheet promo khusus toko ${storeCode} — hanya harga nasional yang dipakai.`);
  return { date, title, items, qoala: [], kinds: items.length ? ["android"] : [], warnings };
}
