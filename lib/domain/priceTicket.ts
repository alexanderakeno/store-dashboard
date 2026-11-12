import type { PriceItem } from "@/types/pricelist";
import type { PriceKind } from "@/types/pricelist";
import type { AccPriceItem } from "@/types/accPrice";
import { isTextSlot, type AnySlot, type ResolvedSlot } from "@/types/priceTicket";

/** Price list kinds a ticket reads: the phone lists plus the accessories list. */
export type TicketKind = PriceKind | "acc";
export type TicketPriceItem = Pick<PriceItem, "name" | "normal" | "promo"> & { kind: TicketKind };

/** Accessories price list rows as ticket rows: selling price = "Repricing Cash", normal = the higher SRP. */
export const accTicketItems = (items: AccPriceItem[]): TicketPriceItem[] =>
  items.filter((x) => x.price > 0).map((x) => ({ kind: "acc", name: x.description, normal: Math.max(x.srp || 0, x.price), promo: x.price }));

/** Brand / range words that price lists add or leave out freely. */
const NOISE = new Set(["SAMSUNG", "GALAXY", "HUAWEI", "OPPO", "MOTOROLA", "MOTO", "INFINIX", "APPLE", "ONLY", "GB", "INCH"]);
/**
 * Words that make another model: a row may carry extra words the ticket does not name (colour, strap, size),
 * but never one of these — "WATCH GT 7" must not take the "WATCH GT 7 PRO" price.
 */
const MODEL_WORDS = new Set(["PRO", "ULTRA", "MAX", "PLUS", "+", "LITE", "FE", "MINI", "NEO", "PLAY", "FOLD", "FLIP", "EDGE", "POWER", "4G", "5G", "LTE", "WIFI", "SE", "X", "S", "C", "T", "BUNDLE", "KIT", "KEYBOARD", "ACTIVE", "SPORT", "CLASSIC", "CELL", "CELLULAR", "NANO"]);

/** "Galaxy Tab S12 Plus 12+8/256GB Wi-Fi" → ["TAB", "S12+", "12/256", "WIFI"]. */
export function nameTokens(s: string): string[] {
  const t = s
    .toUpperCase()
    .replace(/WI-?FI/g, "WIFI")
    .replace(/\b(\d+)\+\d+\//g, "$1/") // 8+8/128 (RAM + extended RAM) → 8/128
    .replace(/(\d+)\s*GB?\s*\+\s*(\d+)/g, "$1/$2") // 8GB+256GB → 8/256
    .replace(/\s*\/\s*/g, "/")
    .replace(/(\d)\s*GB\b/g, "$1")
    .replace(/(\d)\s*TB\b/g, "$1TB")
    .replace(/(\S)\s*\+(?=\s|$)/g, "$1+") // "S12 +" → "S12+"
    .replace(/\s+PLUS\b/g, "+")
    .replace(/[^A-Z0-9/+.\s]/g, " ");
  return t.split(/\s+/).filter((w) => w && !NOISE.has(w));
}

export const normName = (s: string) => nameTokens(s).join(" ");

/** nameTokens, remembered per name: matching ~150 slots against ~1.600 rows tokenised each row 150× per page. */
const TOKENS = new Map<string, string[]>();
function tokensOf(s: string): string[] {
  let t = TOKENS.get(s);
  if (!t) {
    if (TOKENS.size > 20_000) TOKENS.clear();
    t = nameTokens(s);
    TOKENS.set(s, t);
  }
  return t;
}

/** Price list row for a slot: the row with every word of the slot and the fewest other (non-model) words. */
export function matchRow(slot: Pick<AnySlot, "key" | "canva">, items: TicketPriceItem[], kind: TicketKind = "android"): TicketPriceItem | null {
  const want = tokensOf(slot.key);
  let best: { row: TicketPriceItem; extra: number } | null = null;
  const designNormal = slot.canva.strike ?? slot.canva.price;
  for (const row of items) {
    if (row.kind !== kind || !(row.normal > 0)) continue;
    const have = tokensOf(row.name);
    if (!want.every((w) => have.includes(w))) continue;
    const extra = have.filter((w) => !want.includes(w));
    // another model (PRO, 5G, …) or another version (a number) is not a free extra word
    if (extra.some((w) => MODEL_WORDS.has(w) || (/\d/.test(w) && !/^\d+MM$/.test(w)))) continue;
    // same-name rows (colours, bundles): the one with the design's normal price, then its selling price
    const sell = row.promo > 0 && row.promo < row.normal ? row.promo : row.normal;
    const score = extra.length * 4 + (row.normal === designNormal ? 0 : 2) + (sell === slot.canva.price ? 0 : 1);
    if (!best || score < best.extra) best = { row, extra: score };
  }
  return best?.row ?? null;
}

/** Price list price for a ticket slot. Promo < normal → promo price with the normal price struck through. */
export function resolveSlot(slot: AnySlot, items: TicketPriceItem[], kind: TicketKind = "android"): ResolvedSlot {
  const row = matchRow(slot, items, isTextSlot(slot) && slot.list === "acc" ? "acc" : kind);
  const base = { key: slot.key, label: slot.label };
  if (!row) return { ...base, price: slot.canva.price, strike: slot.canva.strike, status: "missing" };
  const promo = row.promo > 0 && row.promo < row.normal ? row.promo : row.normal;
  if (isTextSlot(slot)) {
    const value = slot.field === "monthly" ? monthly(promo) : promo;
    return { ...base, price: value, full: promo, status: value === slot.canva.price ? "same" : "updated", match: row.name };
  }
  let strike = promo < row.normal ? row.normal : undefined;
  let strikeDropped: number | undefined;
  if (strike && !slot.strikeRoom) {
    strikeDropped = strike;
    strike = undefined;
  }
  const same = promo === slot.canva.price && (strike ?? 0) === (slot.canva.strike ?? 0);
  return { ...base, price: promo, strike, status: same ? "same" : "updated", match: row.name, ...(strikeDropped ? { strikeDropped } : {}) };
}

/** Cicilan 0% 24 bulan as printed on Apple tickets: 17.499.000 → 729.125 (rounded down). */
export const monthly = (price: number) => Math.floor(Math.round(price) / 24);

/** "4.299.000" */
export const idNum = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n));

/** "Rp4.299.000" */
export const rupiah = (n: number) => `Rp${new Intl.NumberFormat("id-ID").format(n)}`;

/** Main digits (thousands) and the superscript part of a ticket price: 4299000 → ["4.299", ".000"]. */
export function splitPrice(n: number): [string, string] {
  const v = Math.max(0, Math.round(n));
  return [new Intl.NumberFormat("id-ID").format(Math.floor(v / 1000)), `.${String(v % 1000).padStart(3, "0")}`];
}
