import { modelOf } from "@/lib/parsers/pricelist";
import type { PriceItem, PriceKind, QoalaTier } from "@/types/pricelist";
import type { SohItem } from "@/types/soh";

/** One SOH article matched to a price-list row: the colour is what follows the price-list name. */
export interface PriceStock {
  article: string;
  color: string;
  qty: number;
}

export interface PriceVariant extends PriceItem {
  /** Stable id within the list (duplicated names exist in the PDF). */
  id: string;
  variant: string;
  stock: PriceStock[];
}

export interface PriceModel {
  key: string;
  brand: string;
  series: string;
  model: string;
  variants: PriceVariant[];
}

const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    // "8/128G" and "8/128GB" are the same variant
    .map((t) => t.replace(/^(\d+\/\d+)G$/, "$1GB").replace(/^(\d+\/\d+)T$/, "$1TB"));

/**
 * SOH articles whose description starts with the price-list name (token by token), e.g.
 * "GALAXY A07 4/64GB" ↔ "GALAXY A07 4/64GB LIGHT VIOLET" → colour "LIGHT VIOLET".
 */
export function matchStock(name: string, soh: SohItem[]): PriceStock[] {
  const want = norm(name);
  const out: PriceStock[] = [];
  for (const s of soh) {
    const have = norm(s.description);
    if (have.length < want.length || !want.every((t, i) => have[i] === t)) continue;
    out.push({ article: s.article, color: have.slice(want.length).join(" ") || "—", qty: s.qty });
  }
  return out.sort((a, b) => b.qty - a.qty || a.color.localeCompare(b.color));
}

/** Price-list rows of one kind grouped per model (brand → series order kept as in the PDF). */
export function priceModels(items: PriceItem[], kind: PriceKind, soh: SohItem[]): PriceModel[] {
  const map = new Map<string, PriceModel>();
  items.forEach((it, i) => {
    if (it.kind !== kind) return;
    const { model, variant } = modelOf(it.name);
    const key = `${it.brand}|${model}`;
    const m = map.get(key) ?? { key, brand: it.brand, series: it.series, model, variants: [] };
    m.variants.push({ ...it, id: String(i), variant: variant || "Standar", stock: matchStock(it.name, soh) });
    map.set(key, m);
  });
  return [...map.values()];
}

/** Qoala tier whose price range contains `price` ("Rp 3.000.001 - Rp 5.000.000"). */
export function qoalaFor(price: number, tiers: QoalaTier[]): QoalaTier | null {
  for (const t of tiers) {
    const n = (t.range.match(/\d{1,3}(?:\.\d{3})+|\d+/g) ?? []).map((x) => Number(x.replace(/\./g, "")));
    if (n.length >= 2 && price >= n[0] && price <= n[1]) return t;
  }
  return null;
}

/** Title-cases a model name for display: "GALAXY S26 ULTRA" → "Galaxy S26 Ultra" (keeps codes like "A07", "5G"). */
export function displayName(s: string): string {
  return s
    .split(" ")
    .map((w) => (/\d/.test(w) || w.length <= 2 ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}
