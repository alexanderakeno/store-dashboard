/**
 * Scan Harga: a scanned barcode (or a typed code) → the article in the SOH / accessories price list and its price.
 * Pure — the API passes the SOH, the accessories list and a device-price lookup.
 */
import type { AccPriceItem } from "@/types/accPrice";
import type { SohItem } from "@/types/soh";

/** Upper case letters/digits only; numbers lose leading zeros (an EAN-13 "0…" equals the UPC-A without it). */
export function normCode(s: string): string {
  const x = s.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return /^\d+$/.test(x) ? x.replace(/^0+(?=\d)/, "") : x;
}

export type ScanMatch = "barcode" | "article" | "suffix";

export interface ScanHit {
  code: string;
  match: ScanMatch;
  article: string;
  description: string;
  brand: string;
  category: string;
  /** Units in the SOH (null = not in the SOH). */
  qty: number | null;
  price: number | null;
  /** Normal price / SRP — shown struck through when higher than `price`. */
  normal: number | null;
  /** Accessories: price before this update. */
  current: number | null;
  remark: string;
  /** Price source: accessories list, Android/Apple price list, SOH unit price, none. */
  src: "acc" | "device" | "soh" | "none";
}

export interface DevicePrice {
  price: number;
  normal: number;
  name: string;
  brand: string;
  note?: string;
}

/**
 * Finds the article: SOH barcode → SOH article (typed) → an SOH article that ends with the code (UNIQ, Casestudi, …
 * build the article from the EAN: UNQ8886463690277) → the same two in the accessories list (not in stock).
 * A code that ends more than one article is ambiguous → no hit.
 */
export function findArticle(code: string, soh: SohItem[], acc: AccPriceItem[]): { article: string; match: ScanMatch } | null {
  const c = normCode(code);
  if (c.length < 4) return null;
  for (const s of soh) if (s.barcodes?.some((b) => normCode(b) === c)) return { article: s.article, match: "barcode" };
  const lists = [soh.map((s) => s.article), acc.map((x) => x.article)];
  for (const arts of lists) {
    const exact = arts.find((a) => normCode(a) === c);
    if (exact) return { article: exact, match: "article" };
  }
  if (c.length >= 8)
    for (const arts of lists) {
      const ends = [...new Set(arts.filter((a) => normCode(a).endsWith(c)))];
      if (ends.length === 1) return { article: ends[0], match: "suffix" };
      if (ends.length > 1) return null;
    }
  return null;
}

export function scanLookup(code: string, soh: SohItem[], acc: AccPriceItem[], device: (item: SohItem) => DevicePrice | null): ScanHit | null {
  const f = findArticle(code, soh, acc);
  if (!f) return null;
  const key = f.article.toUpperCase();
  const s = soh.find((x) => x.article.toUpperCase() === key);
  const a = acc.find((x) => x.article === key);
  const base = { code, match: f.match, article: f.article, qty: s ? s.qty : null };
  if (a) return { ...base, description: a.description, brand: a.brand, category: a.category, price: a.price, normal: a.srp, current: a.current, remark: a.remark ?? "", src: "acc" };
  if (s) {
    const d = device(s);
    if (d) return { ...base, description: s.description || d.name, brand: d.brand, category: s.category, price: d.price, normal: d.normal, current: null, remark: d.note ?? "", src: "device" };
    return { ...base, description: s.description, brand: "", category: s.category, price: s.price ?? null, normal: s.price ?? null, current: null, remark: "", src: s.price ? "soh" : "none" };
  }
  return null;
}
