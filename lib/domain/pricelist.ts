import { dedupeItems, modelOf } from "@/lib/parsers/pricelist";
import { iphoneName } from "@/lib/parsers/applePricelist";
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

/**
 * Apple naming differs between the price list and SOH ("MBA 13.6 /M5/8C GPU/16GB/512GB" vs
 * "MBA 13.6 STL/M5/8C GPU/16GB/512GB-IND", "IPAD AIR 11 WI-FI Celluler 128GB" vs "IPAD AIR 11 WF CL 128GB SPG M4"),
 * so Apple rows match on tokens instead of a prefix.
 */
export function appleTokens(s: string): string[] {
  let u = ` ${s.toUpperCase()} `
    .replace(/\([^)]*\)/g, " ")
    .replace(/-IND\b/g, " ")
    .replace(/(\d+)-INCH\b/g, "$1")
    .replace(/\bINCH\b/g, " ")
    .replace(/\bWI-?FI\b|\bWF\b/g, " WIFI ")
    .replace(/\bCELLUL[AE]R|\bCL\b/g, " CELL ")
    .replace(/\bULTRA(\d)\b/g, "ULTRA $1")
    .replace(/(\d+C)(GPU|CPU)\b/g, "$1 $2");
  if (/\bWATCH\b/.test(u)) u = u.replace(/\bS(\d{1,2})\b/g, "$1"); // "WATCH S11 42" = "WATCH 11 42"
  return u
    .split(/[\s/+,]+/)
    .map((t) => t.replace(/^(\d+)G$/, "$1GB").replace(/^(\d+)T$/, "$1TB"))
    .filter((t) => t && t !== "-" && t !== "&");
}

/** Words that tell models apart: a row without "PRO" must not take an SOH article with "PRO". */
const APPLE_DISCRIMINATORS = ["AIR", "PRO", "MAX", "MINI", "PLUS", "ULTRA", "SE", "CELL", "NANO", "STUDIO"];
const isChip = (t: string) => /^M\d$/.test(t);

/** SOH articles for one Apple price-list row; `series` ("iPad Air 11 M4") supplies the chip when the name has none. */
export interface SohTokens {
  item: SohItem;
  tokens: string[];
  set: Set<string>;
}
/** Tokenises SOH once per page instead of once per price-list row. */
export const tokenizeSoh = (soh: SohItem[]): SohTokens[] => soh.map((item) => {
  const tokens = appleTokens(item.description);
  return { item, tokens, set: new Set(tokens) };
});

export function matchAppleStock(name: string, series: string, soh: SohItem[] | SohTokens[]): PriceStock[] {
  const want = new Set(appleTokens(name));
  const extra = new Set(appleTokens(series));
  const wantChips = new Set([...want, ...extra].filter(isChip));
  const out: PriceStock[] = [];
  const list: SohTokens[] = soh.length && "tokens" in soh[0] ? (soh as SohTokens[]) : tokenizeSoh(soh as SohItem[]);
  for (const { item: s, tokens, set: have } of list) {
    if (![...want].every((t) => have.has(t))) continue;
    if (APPLE_DISCRIMINATORS.some((d) => have.has(d) !== want.has(d))) continue;
    const haveChips = tokens.filter(isChip);
    if (haveChips.length && wantChips.size && !haveChips.every((c) => wantChips.has(c))) continue;
    const color = tokens.filter((t) => !want.has(t) && !extra.has(t) && !isChip(t)).join(" ");
    out.push({ article: s.article, color: color || "—", qty: s.qty });
  }
  return out.sort((a, b) => b.qty - a.qty || a.color.localeCompare(b.color));
}

/** Apple Excel rows carry their SAP articles: stock per article, the colour is what the SOH description adds to the name. */
export function matchAppleArticles(name: string, series: string, articles: string[], soh: SohItem[]): PriceStock[] {
  const set = new Set(articles.map((a) => a.toUpperCase()));
  const skip = new Set([...appleTokens(name), ...appleTokens(series)]);
  return soh
    .filter((s) => set.has(s.article.toUpperCase()))
    .map((s) => ({ article: s.article, color: appleTokens(s.description).filter((t) => !skip.has(t) && !isChip(t)).join(" ") || "—", qty: s.qty }))
    .sort((a, b) => b.qty - a.qty || a.color.localeCompare(b.color));
}

/**
 * Apple: one model per Product label (PDF) / series title (Excel); the variant is the part of the name not shared by
 * the whole group. `inStockOnly` hides models with no stock in any variant.
 */
/** True when every word of one `patterns` entry is in the row's series + name ("iPad Pro M5" ↔ "IPAD PRO 11-INCH M5 WI-FI 512GB"). */
export function alwaysShown(it: Pick<PriceItem, "series" | "name">, patterns: string[]): boolean {
  if (!patterns.length) return false;
  const have = new Set(appleTokens(`${it.series} ${it.name}`).flatMap((t) => [t, ...t.split("-")]));
  return patterns.some((p) => {
    const want = appleTokens(p);
    return want.length > 0 && want.every((t) => have.has(t));
  });
}

function appleModels(items: PriceItem[], sohItems: SohItem[], inStockOnly = false, always: string[] = []): PriceModel[] {
  const map = new Map<string, PriceModel>();
  // only Apple articles can match; tokenise them once
  const soh = tokenizeSoh(sohItems.filter((s) => /\b(IPHONE|IPAD|MB[ANP]|MAC|IMAC|APPLE|AIRPODS)\b/i.test(s.description)));
  const rows = new Map<string, Array<{ it: PriceItem; i: number; stock: PriceStock[] }>>();
  items.forEach((it, i) => {
    if (it.kind !== "apple") return;
    const stock = it.articles?.length ? matchAppleArticles(it.name, it.series, it.articles, sohItems) : matchAppleStock(it.name, it.series, soh);
    const key = `${it.brand}|${it.series}`;
    rows.set(key, [...(rows.get(key) ?? []), { it, i, stock }]);
  });
  for (const [key, list] of rows) {
    // shared prefix of all names, cut back to a word or "/" boundary ("MBA 15.3 /M5/10C GPU/" → "16GB/512GB")
    const names = list.map(({ it }) => it.name);
    let p = 0;
    while (list.length > 1 && names.every((n) => n.length > p && n[p].toUpperCase() === names[0][p].toUpperCase())) p++;
    const edge = (n: string) => n.length === p || " /".includes(n[p]) || " /".includes(n[p - 1]);
    while (p > 0 && !names.every(edge)) p--;
    const { brand, series } = list[0].it;
    const m: PriceModel = { key, brand, series: brand, model: series, variants: [] };
    list.forEach(({ it, i, stock }) => {
      let variant = list.length > 1 ? it.name.slice(p).replace(/^[\s/+-]+/, "").trim() : "";
      // identical descriptions (Watch Ultra 3 + Milanese Loop) differ only by the bracket note
      if (!variant && list.length > 1) variant = it.note ?? "";
      if (/^\d{2}$/.test(variant) && brand === "Apple Watch") variant += "mm";
      m.variants.push({ ...it, id: String(i), variant: variant || "Standar", stock });
    });
    // Apple shows only models the store has (PDF rows match SOH by tokens, Excel by article). A model with stock in
    // any variant is shown with ALL its variants, so every storage's price can be quoted.
    if (inStockOnly && !m.variants.some((v) => v.stock.some((x) => x.qty > 0) || alwaysShown(v, always))) continue;
    // same variant label twice (e.g. two straps of one watch) → tell them apart by the bracket note
    for (const v of m.variants) if (m.variants.filter((x) => x.variant === v.variant).length > 1 && v.note) v.variant = `${v.variant} · ${v.note}`;
    map.set(key, m);
  }
  return [...map.values()];
}

/** Price-list rows of one kind grouped per model (brand → series order kept as in the PDF). */
/** Android Excel rows carry their SAP articles: stock is read per article, the colour is what follows the name. */
export function matchArticles(name: string, articles: string[], soh: SohItem[]): PriceStock[] {
  const want = norm(name);
  const set = new Set(articles.map((a) => a.toUpperCase()));
  return soh
    .filter((s) => set.has(s.article.toUpperCase()))
    .map((s) => {
      const have = norm(s.description);
      const prefix = have.length > want.length && want.every((t, i) => have[i] === t);
      return { article: s.article, color: (prefix ? have.slice(want.length) : have).join(" ") || "—", qty: s.qty };
    })
    .sort((a, b) => b.qty - a.qty || a.color.localeCompare(b.color));
}

/**
 * `inStockOnly`: a model is shown only when SOH has stock for one of its variants — then with all its variants (every
 * storage's price). Android rows without articles (PDF imports) always count as shown; Apple PDF rows match by tokens.
 */
export function priceModels(stored: PriceItem[], kind: PriceKind, soh: SohItem[], opts: { inStockOnly?: boolean; alwaysShow?: string[] } = {}): PriceModel[] {
  // fixes apply to data already in the sheet too: rows printed twice are shown once, "IPHONE 17E" reads "iPhone 17e"
  const items = stored.map((it) => (it.kind === "apple" ? { ...it, name: iphoneName(it.name) } : it));
  dedupeItems(items, []);
  if (kind === "apple" && items.some((it) => it.kind === "apple" && (it.credit != null || it.articles?.length))) return appleModels(items, soh, opts.inStockOnly, opts.alwaysShow);
  const map = new Map<string, PriceModel>();
  items.forEach((it, i) => {
    if (it.kind !== kind) return;
    const stock = it.articles?.length ? matchArticles(it.name, it.articles, soh) : matchStock(it.name, soh);
    const { model, variant } = modelOf(it.name);
    const key = `${it.brand}|${model}`;
    const m = map.get(key) ?? { key, brand: it.brand, series: it.series, model, variants: [] };
    m.variants.push({ ...it, id: String(i), variant: variant || "Standar", stock });
    map.set(key, m);
  });
  // Excel rows: a model is shown when one of its variants has stock (or is always shown) — then with ALL its variants
  if (!opts.inStockOnly) return [...map.values()];
  const keep = (v: PriceVariant) => !v.articles?.length || v.stock.some((x) => x.qty > 0) || alwaysShown(v, opts.alwaysShow ?? []);
  return [...map.values()].filter((m) => m.variants.some(keep));
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
    // mixed-case words ("iPhone", "MacBook") are already display-ready
    .map((w) => (/\d/.test(w) || w.length <= 2 || /[a-z]/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}
