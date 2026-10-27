import type { SohItem } from "@/types/soh";
import type { SohParse } from "./soh";
import { AIRPODS, isAirPods } from "@/lib/domain/airpods";

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const up = (s: unknown) => clean(s).toUpperCase();
const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = clean(v).replace(/\./g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
};

const BRANDS: Record<string, string> = { XIAOMI: "Xiaomi", SAMSUNG: "Samsung", HUAWEI: "Huawei", OPPO: "Oppo", INFINIX: "Infinix", MOTOROLA: "Motorola", AMAZFIT: "Amazfit", VIVO: "Vivo", REALME: "Realme", TECNO: "Tecno", HONOR: "Honor", SPC: "SPC" };
const brandName = (b: string) => BRANDS[b] ?? (b ? b.charAt(0) + b.slice(1).toLowerCase() : "Lainnya");
const APPLE: Record<string, string> = { PHONE: "iPhone", TABLETS: "iPad", LAPTOPS: "MacBook", DESKTOP: "iMac", WATCH: "Apple Watch" };

/** Device categories first (same order as the PDF), then the rest. */
const ORDER = ["iPhone", "iPad", "MacBook", "iMac", "Apple Watch", AIRPODS, "Apple", "Samsung", "Oppo", "Xiaomi", "Huawei", "Infinix", "Motorola", "Amazfit"];
const LAST = ["Aksesoris", "Elektronik"];

/** Product groups that are not sellable stock: display units, warranty cards / printing, vouchers. */
const SKIP: Record<string, string> = { DEMO: "unit demo", SUPPORTING: "supporting (kartu garansi, printing)", MERCHANDISE: "merchandise / voucher" };

/** True when the grid is the "Stock Position Report" Excel (header row says so). */
export function isSohXlsx(rows: unknown[][]): boolean {
  return rows.slice(0, 3).some((r) => (r ?? []).some((c) => /STOCK POSITION REPORT/i.test(clean(c))));
}

/** "25-10-2026" (or 25/10/2026) → "2026-10-25". */
function isoOf(s: string): string | null {
  const m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s);
  if (!m) return null;
  const [d, mo] = [Number(m[1]), Number(m[2])];
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Parses the "Stock Position Report" Excel (stockpositionreportdetail.xls, one sheet):
 * header row "Store : … Date : … Stock Position Report For DD-MM-YYYY", then one row per stock line —
 * Brand · Division · Product Group · Category · "ARTICLE / DESCRIPTION" · Barcode · Price · Qty · Value —
 * and a "Grand Total For Stock Quantity & Value" row used to check the qty.
 *
 * - Serial-numbered stock is printed one line per unit and the Qty column is mostly 0 on those lines, so every
 *   line counts as at least 1 unit: units per line = max(Qty, 1) (a charger line with Qty 5 still counts 5).
 *   An article repeated on N lines = N units.
 * - DEVICES: Apple per category (iPhone · iPad · MacBook · iMac · Apple Watch), other brands per brand.
 *   Apple AirPods / EarPods (ACCESSORIES › EARPHONES) → "AirPods", with the unit price kept as their price.
 *   ACCESSORIES → "Aksesoris"; motorized / smart home / electronic → "Elektronik".
 * - DEMO units, SUPPORTING and MERCHANDISE (vouchers) are not sellable stock and are skipped.
 */
export function parseSohXlsx(rows: unknown[][]): SohParse {
  const warnings: string[] = [];
  const head = (rows.slice(0, 3).flat() as unknown[]).map(clean);
  const title = head.find((c) => /STOCK POSITION REPORT/i.test(c)) ?? "";
  const store = head[head.findIndex((c) => /^STORE\s*:?$/i.test(c)) + 1] ?? "";
  let date = isoOf(title);
  if (!date) {
    // fall back to the "Date :" cell (Excel serial)
    const i = head.findIndex((c) => /^DATE\s*:?$/i.test(c));
    const serial = i >= 0 ? num((rows.slice(0, 3).flat() as unknown[])[i + 1]) : NaN;
    if (Number.isFinite(serial) && serial > 40000) date = new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);
  }

  const byArticle = new Map<string, SohItem>();
  const skipped = new Map<string, number>();
  let grand: number | null = null;
  let counted = 0;
  let bad = 0;
  for (const r of rows) {
    if (!r?.length) continue;
    const first = clean(r[0]);
    if (/^GRAND TOTAL/i.test(first)) {
      const g = num(r[1]);
      if (Number.isFinite(g)) grand = g;
      continue;
    }
    const group = up(r[2]);
    const text = clean(r[4]);
    const qty = num(r[7]);
    // the report header row (Store : … Date : … Time : …) is not a stock line
    if (!group || !text || r.some((c) => /STOCK POSITION REPORT|^STORE\s*:/i.test(clean(c)))) continue;
    if (Number.isFinite(qty)) counted += qty;
    else bad++;
    // a listed line is a unit in the store even when Qty says 0
    const units = Number.isFinite(qty) && qty > 1 ? Math.round(qty) : 1;
    if (SKIP[group]) {
      skipped.set(group, (skipped.get(group) ?? 0) + units);
      continue;
    }
    const cut = text.indexOf(" / ");
    const article = up(cut > 0 ? text.slice(0, cut) : text.split(" ")[0]);
    const description = (cut > 0 ? text.slice(cut + 3) : text.slice(article.length)).trim().slice(0, 200) || article;
    if (!article) continue;
    const brand = up(r[0]);
    const cat = up(r[3]);
    // Apple's own AirPods / EarPods get their own category (the report files them under ACCESSORIES › EARPHONES)
    const category = isAirPods(brand, description)
      ? AIRPODS
      : group === "DEVICES" ? (brand === "APPLE" ? APPLE[cat] ?? "Apple" : brandName(brand)) : group === "ACCESSORIES" ? "Aksesoris" : "Elektronik";
    const price = num(r[6]);
    const it = byArticle.get(article);
    if (it) {
      it.qty += units;
      if (Number.isFinite(price) && price > (it.price ?? 0)) it.price = price;
    } else byArticle.set(article, { category, article, description, qty: units, ...(Number.isFinite(price) && price > 0 ? { price } : {}) });
  }

  const items = [...byArticle.values()];
  const rank = (c: string) => (ORDER.includes(c) ? ORDER.indexOf(c) : LAST.includes(c) ? 100 + LAST.indexOf(c) : 50);
  const categories = [...new Set(items.map((x) => x.category))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  items.sort((a, b) => rank(a.category) - rank(b.category) || a.category.localeCompare(b.category) || a.description.localeCompare(b.description));
  const totals: Record<string, number> = {};
  for (const x of items) totals[x.category] = (totals[x.category] ?? 0) + x.qty;

  if (!title) warnings.push('Judul "Stock Position Report" tidak ditemukan — bukan file Stock Position Report?');
  if (!date) warnings.push("Tanggal laporan tidak terbaca.");
  // the Grand Total sums the Qty column, so it is checked against that column (not against the counted units)
  if (grand != null && Math.round(grand) !== Math.round(counted)) warnings.push(`Kolom Qty terbaca ${counted.toLocaleString("id-ID")} ≠ Grand Total ${grand.toLocaleString("id-ID")} di file — cek apakah file terpotong.`);
  if (bad) warnings.push(`${bad} baris tanpa angka qty (dihitung 1 unit).`);
  for (const [g, q] of skipped) if (q) warnings.push(`${SKIP[g]} tidak diimport (${q.toLocaleString("id-ID")} unit).`);
  return { date, title: [title, store].filter(Boolean).join(" · "), categories, items, totals, warnings };
}
