import type { ISODate } from "@/types/domain";
import type { PromoArticle, PromoKind, PromoProgram, PromoRange, SamsungPromo } from "@/types/samsungPromo";
import { matchStock } from "./pricelist";

export type PromoState = "aktif" | "akan" | "selesai";

/** Today's state of a promo with these ranges (no ranges = always on). */
export function promoState(ranges: PromoRange[], today: ISODate): PromoState {
  if (!ranges.length || ranges.some((r) => r.from <= today && today <= r.to)) return "aktif";
  return ranges.some((r) => r.from > today) ? "akan" : "selesai";
}

/** Next start date of an upcoming promo. */
export const nextStart = (ranges: PromoRange[], today: ISODate) => ranges.filter((r) => r.from > today).map((r) => r.from).sort()[0] ?? null;
/** End of the range running today (or the last end). */
export const endOf = (ranges: PromoRange[], today: ISODate) => (ranges.find((r) => r.from <= today && today <= r.to) ?? ranges[ranges.length - 1])?.to ?? null;

/** A store may use the promo: no store list, or ours is on it. Info-only rows (no value) apply everywhere. */
export const forStore = (a: Pick<PromoArticle, "stores" | "value">, store: string) => !a.stores.length || !a.value || (!!store && a.stores.includes(store.toUpperCase()));

const KIND_WORDS: Array<[PromoKind, RegExp]> = [
  ["TAMBAHAN TRADE IN", /TAMBAHAN TRADE ?IN|TRADE ?IN TAMBAHAN|ADDITIONAL/],
  ["TRADE IN", /TRADE ?IN/],
  ["EIP", /\bEIP\b/],
  ["PWP", /\bPWP\b/],
];

function kindsIn(s: string): PromoKind[] {
  const out: PromoKind[] = [];
  let t = s;
  for (const [k, re] of KIND_WORDS)
    if (re.test(t)) {
      out.push(k);
      t = t.replace(new RegExp(re.source, "g"), " ");
    }
  return out;
}

/** Program type text → promo kind ("ADDITIONAL / TAMBAHAN TRADE IN" → TAMBAHAN TRADE IN). */
export const kindOfType = (type: string): PromoKind | null => kindsIn(type.toUpperCase())[0] ?? null;

/**
 * Promo kinds that cannot be used together, read from the summary's combine rules: the clause
 * around "TIDAK BISA" ("apabila customer memilih promo EIP maka tidak bisa menggunakan promo
 * tambahan trade in" → EIP ✕ TAMBAHAN TRADE IN; "promo ini" = the program's own kind).
 */
export function exclusions(programs: PromoProgram[]): Array<[PromoKind, PromoKind]> {
  const out: Array<[PromoKind, PromoKind]> = [];
  for (const p of programs) {
    const t = p.combine.toUpperCase();
    for (let i = t.indexOf("TIDAK BISA"); i >= 0; i = t.indexOf("TIDAK BISA", i + 1)) {
      const start = Math.max(t.lastIndexOf("APABILA", i), t.lastIndexOf(".", i), t.lastIndexOf("(", i), 0);
      const ends = [t.indexOf("NAMUN", i), t.indexOf(".", i), t.indexOf(")", i), t.indexOf("!", i)].filter((x) => x > i);
      const clause = t.slice(start, ends.length ? Math.min(...ends) : t.length);
      const kinds = kindsIn(clause);
      const own = kindOfType(p.type);
      if (/PROMO INI/.test(clause) && own && !kinds.includes(own)) kinds.push(own);
      for (let a = 0; a < kinds.length; a++) for (let b = a + 1; b < kinds.length; b++) out.push([kinds[a], kinds[b]]);
    }
  }
  return out;
}

export interface VariantPromoItem {
  kind: PromoKind;
  code: string;
  value: number;
  state: PromoState;
  ranges: PromoRange[];
  sheet: string;
}

export interface VariantPromo {
  items: VariantPromoItem[];
  /** Best cash benefit today (trade in, extra trade in, EIP) respecting exclusions. */
  cash: { total: number; kinds: PromoKind[] };
  /** Largest PWP cashback today (spent on PWP items, not off the device price). */
  pwp: number;
  /** A promo sheet lists the device without values (see its terms). */
  info: string[];
}

const CASH: PromoKind[] = ["TRADE IN", "TAMBAHAN TRADE IN", "EIP"];

/** Best combination of cash promos: one per kind, no excluded pair together. */
export function bestCash(items: VariantPromoItem[], excl: Array<[PromoKind, PromoKind]>): { total: number; kinds: PromoKind[] } {
  const per = new Map<PromoKind, number>();
  for (const it of items) if (it.state === "aktif" && CASH.includes(it.kind) && it.value > (per.get(it.kind) ?? 0)) per.set(it.kind, it.value);
  const kinds = [...per.keys()];
  let best = { total: 0, kinds: [] as PromoKind[] };
  for (let mask = 1; mask < 1 << kinds.length; mask++) {
    const pick = kinds.filter((_, i) => mask & (1 << i));
    if (excl.some(([a, b]) => pick.includes(a) && pick.includes(b))) continue;
    const total = pick.reduce((s, k) => s + per.get(k)!, 0);
    if (total > best.total) best = { total, kinds: pick };
  }
  return best;
}

/**
 * Samsung promos for one price-list row, matched like SOH stock: promo articles whose description
 * starts with the price-list name ("GALAXY S26 FE 8/256GB" ↔ "GALAXY S26 FE 8/256GB BLUEBERRY").
 * Finished promos and promos of other stores are left out.
 */
export function variantPromo(name: string, promo: SamsungPromo, today: ISODate, store: string, excl = exclusions(promo.programs)): VariantPromo | null {
  const arts = promo.articles.filter((a) => forStore(a, store));
  const hit = new Set(matchStock(name, arts.map((a) => ({ category: "", article: a.article, description: a.description, qty: 0 }))).map((m) => m.article));
  if (!hit.size) return null;
  const seen = new Map<string, VariantPromoItem>();
  const info = new Set<string>();
  for (const a of arts) {
    if (!hit.has(a.article)) continue;
    const state = promoState(a.ranges, today);
    if (state === "selesai") continue;
    if (!a.value) {
      info.add(a.sheet);
      continue;
    }
    const k = `${a.kind}|${a.code}|${a.value}`;
    if (!seen.has(k)) seen.set(k, { kind: a.kind, code: a.code, value: a.value, state, ranges: a.ranges, sheet: a.sheet });
  }
  const order: Record<PromoKind, number> = { PWP: 0, "TRADE IN": 1, "TAMBAHAN TRADE IN": 2, EIP: 3, LAIN: 4 };
  const items = [...seen.values()].sort((a, b) => (a.state === b.state ? 0 : a.state === "aktif" ? -1 : 1) || order[a.kind] - order[b.kind] || b.value - a.value);
  if (!items.length && !info.size) return null;
  const pwp = Math.max(0, ...items.filter((i) => i.kind === "PWP" && i.state === "aktif").map((i) => i.value));
  return { items, cash: bestCash(items, excl), pwp, info: [...info] };
}
