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
  /** What follows the price-list name in the promo articles (colour, "WIFI"), when it tells promos apart. */
  label: string;
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
  /** Cashback programs run in ETP that name this model (no value in the workbook). */
  etp: EtpPromo[];
}

const CASH: PromoKind[] = ["TRADE IN", "TAMBAHAN TRADE IN", "EIP"];

/** Words two colour texts share ("GRAY WIFI" + "GRAY WIFI" → same; "BLACK" + "WHITE" → ""). */
function commonWords(a: string, b: string): string {
  const w = new Set(b.split(" "));
  return a.split(" ").filter((x) => w.has(x)).join(" ");
}

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
  const matched = matchStock(name, arts.map((a) => ({ category: "", article: a.article, description: a.description, qty: 0 })));
  const hit = new Set(matched.map((m) => m.article));
  const suffix = new Map(matched.map((m) => [m.article, m.color === "—" ? "" : m.color]));
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
    const tail = suffix.get(a.article) ?? "";
    const prev = seen.get(k);
    if (!prev) seen.set(k, { kind: a.kind, label: tail, code: a.code, value: a.value, state, ranges: a.ranges, sheet: a.sheet });
    else if (prev.label !== tail) prev.label = commonWords(prev.label, tail);
  }
  const order: Record<PromoKind, number> = { PWP: 0, "TRADE IN": 1, "TAMBAHAN TRADE IN": 2, EIP: 3, LAIN: 4 };
  // a label only matters when one kind has several values for this row (e.g. Tab A11 WiFi vs LTE)
  const orig = new Map([...seen.values()].map((x) => [x, x.label]));
  for (const it of seen.values()) {
    const same = [...seen.values()].filter((x) => x.kind === it.kind);
    if (same.length < 2) {
      it.label = "";
      continue;
    }
    // drop the words all of them share (the colour "GRAY"), keep what tells them apart ("WIFI")
    const shared = same.map((x) => orig.get(x)!).reduce(commonWords).split(" ");
    it.label = orig.get(it)!.split(" ").filter((w) => w && !shared.includes(w)).join(" ");
  }
  // "WIFI" vs nothing → "WIFI" vs "tanpa WIFI"
  for (const it of seen.values())
    if (!it.label && [...seen.values()].filter((x) => x.kind === it.kind).length > 1) {
      const others = [...new Set([...seen.values()].filter((x) => x.kind === it.kind && x !== it && x.label).map((x) => x.label))];
      it.label = others.length ? `tanpa ${others.join("/")}` : "";
    }
  const items = [...seen.values()].sort((a, b) => (a.state === b.state ? 0 : a.state === "aktif" ? -1 : 1) || order[a.kind] - order[b.kind] || b.value - a.value);
  if (!items.length && !info.size) return null;
  const pwp = Math.max(0, ...items.filter((i) => i.kind === "PWP" && i.state === "aktif").map((i) => i.value));
  return { items, cash: bestCash(items, excl), pwp, info: [...info], etp: [] };
}

export type PromoCategory = "Phone" | "Tablet" | "Watch" | "Buds";

/** Series a promo text talks about, in category order: Galaxy Z / S / A, Tab S / Tab A, Watch, Buds. */
export const SERIES: Array<{ key: string; category: PromoCategory; re: RegExp }> = [
  { key: "Galaxy Z", category: "Phone", re: /\bZ\s*(FLIP|FOLD)|\bFOLDABLE\b|\bFLIP\s*\d|\bFOLD\s*\d/ },
  { key: "Galaxy S", category: "Phone", re: /(?<!TAB\s)(?<!TAB)\bS\d{2}(?:\s*FE)?\b/ },
  { key: "Galaxy A", category: "Phone", re: /(?<!TAB\s)(?<!TAB)\bA\d{2}\b/ },
  { key: "Tab S", category: "Tablet", re: /\bTAB\s*S\d{1,2}/ },
  { key: "Tab A", category: "Tablet", re: /\bTAB\s*A\d{1,2}/ },
  { key: "Watch", category: "Watch", re: /\bWATCH\b|\bFIT\s*\d/ },
  { key: "Buds", category: "Buds", re: /\bBUDS\b/ },
];
export const CATEGORIES: PromoCategory[] = ["Phone", "Tablet", "Watch", "Buds"];

/** Series named in a promo (its name and the descriptions of its promo articles). */
export function seriesOf(texts: string[]): string[] {
  const t = texts.join(" | ").toUpperCase();
  return SERIES.filter((s) => s.re.test(t)).map((s) => s.key);
}
export const categoryOf = (series: string) => SERIES.find((s) => s.key === series)?.category ?? null;

const MODEL_RE = /\b(?:TAB\s*)?[ASZ]\s?\d{1,2}(?:\s?(?:FE|PLUS|ULTRA|LITE)){0,2}\b|\bZ\s*(?:FLIP|FOLD)\s*\d{1,2}(?:\s*ULTRA)?\b|\bWATCH\s*\d{1,2}(?:\s*CLASSIC)?\b|\bWATCH\s*ULTRA\s*\d?\b|\bBUDS\s*\d?\s*(?:PRO|FE|CORE)?\b/g;
const STORAGE_RE = /^\s*(?:5G\s*)?(?:[&,\-–]\s*)?(\d{1,2}\s*\/\s*\d{1,4}\s*(?:GB?|TB?))\b/;
const key = (s: string) => s.replace(/\s+/g, "");
const storage = (s: string) => key(s).replace(/G$/, "GB").replace(/T$/, "TB");

const CONN_RE = /^\s*(5G|WIFI|WI-FI|LTE)\b/;
const conn = (c: string | undefined) => (c ? c.replace("WI-FI", "WIFI") : "");

/**
 * Model keys named in a promo text ("S26 PLUS", "TAB S10 FE", "Z FOLD 7"), each with the
 * storages and connectivity (5G / WIFI) written right after it ("" = not said).
 */
export function modelKeys(text: string): Map<string, { storages: Set<string>; conns: Set<string> }> {
  // "TAB S11 5G ULTRA" names the Ultra: put the suffix before the connectivity
  const t = text.toUpperCase().replace(/\b(5G|WIFI|LTE)\s+(ULTRA|PLUS|FE|LITE)\b/g, "$2 $1");
  const out = new Map<string, { storages: Set<string>; conns: Set<string> }>();
  for (const m of t.matchAll(MODEL_RE)) {
    const k = key(m[0]);
    const e = out.get(k) ?? { storages: new Set<string>(), conns: new Set<string>() };
    let rest = t.slice((m.index ?? 0) + m[0].length);
    e.conns.add(conn(rest.match(CONN_RE)?.[1]));
    for (let s = rest.match(STORAGE_RE); s; s = rest.match(STORAGE_RE)) {
      e.storages.add(storage(s[1]));
      rest = rest.slice(s[0].length);
    }
    out.set(k, e);
  }
  return out;
}

export interface EtpPromo {
  no: number;
  type: string;
  name: string;
  period: string;
  state: PromoState;
}

/**
 * Cashback programs run in ETP ("BR di ETP"): the workbook has no value per article, only the
 * models in the program name. A price-list row gets them when its model (and storage, if the
 * program names storages for that model) is named.
 */
export function etpPromos(name: string, programs: PromoProgram[], today: ISODate, store: string): EtpPromo[] {
  const row = modelKeys(name);
  const first = [...row.keys()][0];
  if (!first) return [];
  const rowConn = [...row.get(first)!.conns][0] ?? "";
  const rowStorage = name.toUpperCase().match(/\b(\d{1,2}\s*\/\s*\d{1,4}\s*(?:GB?|TB?))\b/)?.[1];
  const out: EtpPromo[] = [];
  for (const p of programs) {
    if (!/\bETP\b/i.test(p.mechanism) || !/CASHBACK/i.test(p.type)) continue;
    if (p.stores.length && !p.stores.includes(store.toUpperCase())) continue;
    const keys = modelKeys(p.name);
    const e = keys.get(first);
    if (!e) continue;
    if (e.storages.size && rowStorage && !e.storages.has(storage(rowStorage))) continue;
    // "TAB S10 FE 5G" is not the WiFi model; a text that does not say (or says both) fits any
    if (rowConn && !e.conns.has("") && !e.conns.has(rowConn)) continue;
    const state = promoState(p.ranges, today);
    if (state === "selesai") continue;
    out.push({ no: p.no, type: p.type, name: p.name, period: p.period, state });
  }
  return out;
}
