import type { AccPriceItem } from "@/types/accPrice";
import type { Sheet } from "./androidXlsx";

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const key = (s: unknown) => clean(s).toUpperCase().replace(/[^A-Z]/g, "");
const money = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  const s = clean(v).replace(/^RP\.?\s*/i, "").replace(/[.,](?=\d{3}(\D|$))/g, "");
  return /^\d+$/.test(s) ? Number(s) : 0;
};

/** "Back screen" / "Back Screen" → "Back Screen", "CROSSBODY" → "Crossbody"; short acronyms (IOT) stay. */
const titleCase = (s: string) => s.split(" ").map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(" ");

const MONTHS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MEI: 5, MAY: 5, JUN: 6, JUL: 7, AGU: 8, AGS: 8, AUG: 8, SEP: 9, OKT: 10, OCT: 10, NOV: 11, DES: 12, DEC: 12 };

/** "Update 8 November 2026" / "8 Nov. 2026" → "2026-11-08". */
export function accDate(s: string): string | null {
  const m = /(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})/.exec(s);
  if (!m) return null;
  const mo = MONTHS[m[2].toUpperCase()];
  const d = Number(m[1]);
  if (!mo || d < 1 || d > 31) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Column index per field, found by the header labels (order in the file does not matter). */
const LABELS = {
  brand: ["BRAND"],
  article: ["SAPARTICLE", "ARTICLE"],
  description: ["SAPDESCRIPTION", "DESCRIPTION"],
  category: ["CATEGORY"],
  srp: ["REFERENCESRP", "SRP"],
  current: ["CURRENTSRPCASH", "CURRENTSRP"],
  price: ["REPRICINGCASH", "REPRICING"],
  remark: ["REMARKS", "REMARK"],
} as const;
type Field = keyof typeof LABELS;

function header(rows: unknown[][]): { at: number; col: Record<Field, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] ?? []).map(key);
    const col = {} as Record<Field, number>;
    for (const f of Object.keys(LABELS) as Field[]) col[f] = cells.findIndex((c) => (LABELS[f] as readonly string[]).includes(c));
    if (col.article >= 0 && col.price >= 0 && col.description >= 0) return { at: i, col };
  }
  return null;
}

/** True for the accessories price list Excel: a header with SAP Article · SAP Description · Repricing Cash. */
export function isAccPriceListXlsx(sheets: Sheet[]): boolean {
  return sheets.some((s) => header(s.rows) !== null);
}

export interface AccPriceParse {
  date: string | null;
  title: string;
  items: AccPriceItem[];
  warnings: string[];
}

/**
 * Parses "digiplus Price List Accessories <date>.xlsx": title rows (PT. MAP ZONA ADIPERKASA · Digimap/ Digiplus Price ·
 * Update 8 November 2026), then Brand · SAP Article · Article Mapemall · SAP Description · Category · Reference SRP ·
 * Current SRP Cash · Repricing Cash · BR/ Zout · Remarks. Only the first sheet with that header is read (Sheet2 of
 * the file repeats some Apple articles with the same price).
 *
 * - Selling price = Repricing Cash (new price), else Current SRP Cash, else Reference SRP.
 * - Articles are trimmed / upper-cased; an article listed twice (a copy with a trailing space) keeps the first row.
 */
export function parseAccPriceListXlsx(sheets: Sheet[]): AccPriceParse {
  const sheet = sheets.find((s) => header(s.rows));
  if (!sheet) return { date: null, title: "", items: [], warnings: ["Header SAP Article / SAP Description / Repricing Cash tidak ditemukan."] };
  const { at, col } = header(sheet.rows)!;
  const top = sheet.rows.slice(0, at).flat().map(clean).filter(Boolean);
  const date = top.map(accDate).find(Boolean) ?? null;
  const title = top.filter((t) => !/^PT\.?\s/i.test(t)).join(" · ").slice(0, 160);
  const warnings: string[] = [];
  const seen = new Map<string, AccPriceItem>();
  let dup = 0;
  let noPrice = 0;
  const cell = (r: unknown[], f: Field) => (col[f] >= 0 ? r[col[f]] : null);
  for (const r of sheet.rows.slice(at + 1)) {
    if (!r?.length) continue;
    const article = clean(cell(r, "article")).toUpperCase();
    if (!article) continue;
    const srp = money(cell(r, "srp"));
    const current = money(cell(r, "current"));
    const price = money(cell(r, "price")) || current || srp;
    if (!price) {
      noPrice++;
      continue;
    }
    if (seen.has(article)) {
      dup++;
      continue;
    }
    const remark = clean(cell(r, "remark"));
    seen.set(article, {
      article: article.slice(0, 40),
      brand: clean(cell(r, "brand")).slice(0, 40) || "Lainnya",
      description: clean(cell(r, "description")).slice(0, 160) || article,
      category: titleCase(clean(cell(r, "category"))).slice(0, 40) || "Lainnya",
      srp: srp || price,
      current: current || price,
      price,
      ...(remark ? { remark: remark.slice(0, 120) } : {}),
    });
  }
  if (dup) warnings.push(`${dup} artikel tercantum dua kali — dipakai baris pertama.`);
  if (noPrice) warnings.push(`${noPrice} baris tanpa harga dilewati.`);
  if (!date) warnings.push('Tanggal update tidak terbaca (baris "Update … 2026").');
  return { date, title, items: [...seen.values()], warnings };
}
