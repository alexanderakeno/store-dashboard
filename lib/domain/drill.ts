import type { SalesLine } from "@/types/domain";

/** Which Overview popup a drill-down belongs to. */
export type DrillGroup = "apple" | "android" | "vas";

export interface ArticleSale {
  article: string;
  description: string;
  qty: number;
  value: number;
  staff: Array<{ name: string; qty: number; value: number }>;
}

/** Lines behind one row of an Overview popup: Apple LOB, Android brand, or VAS provider. */
export function drillLines(lines: SalesLine[], group: DrillGroup, key: string): SalesLine[] {
  if (group === "apple") return lines.filter((l) => l.lob === key);
  if (group === "android") return lines.filter((l) => l.group === "Android" && (l.lob ?? "Lainnya") === key);
  return lines.filter((l) => l.vasProvider === key);
}

/**
 * Articles sold in `lines`, best sellers first, each with the sales people who sold it.
 * `qtyAll` counts every line's qty (VAS); otherwise only qty-counted types, as the popup rows do.
 */
export function articleSales(lines: SalesLine[], qtyAll = false): ArticleSale[] {
  const map = new Map<string, ArticleSale & { by: Map<string, { name: string; qty: number; value: number }> }>();
  for (const l of lines) {
    const key = l.article || l.description;
    const a = map.get(key) ?? { article: l.article, description: l.description, qty: 0, value: 0, staff: [], by: new Map() };
    const q = qtyAll || l.countsInQty ? l.qty : 0;
    a.qty += q;
    a.value += l.amount;
    const sk = l.nik || l.staffName;
    const st = a.by.get(sk) ?? { name: l.staffName || "—", qty: 0, value: 0 };
    st.qty += q;
    st.value += l.amount;
    a.by.set(sk, st);
    map.set(key, a);
  }
  return [...map.values()]
    .map(({ by, ...a }) => ({ ...a, staff: [...by.values()].filter((x) => x.qty || x.value).sort((x, y) => y.qty - x.qty || y.value - x.value) }))
    .filter((a) => a.qty || a.value)
    .sort((x, y) => y.qty - x.qty || y.value - x.value);
}

/** One product type (e.g. "IPHONE 18 PRO MAX 256GB") with its colour variants. */
export interface TypeSale {
  type: string;
  qty: number;
  value: number;
  /** Colour variants (one per article), best sellers first. */
  variants: Array<ArticleSale & { color: string }>;
}

// "256GB", "1TB", "8/256GB", "6/128G", "8/256", "128G" — but not the network tokens "4G" / "5G"
const STORAGE = /^\d+\/\d+(GB|TB|G|T)?$|^\d+(GB|TB)$|^\d{2,4}G$/i;
const CHIP = /^M\d+$/i;
const WATCH_SIZE = /^(38|40|41|42|44|45|46|49)(MM)?$/i;

/**
 * Splits an article description into product type and colour, using the formats in the sales data:
 * - storage token ends the type: "IPHONE 18 PRO MAX 256GB BURGUN" → "IPHONE 18 PRO MAX 256GB" + "BURGUN",
 *   "GALAXY A17 8/128GB LIGHT BLUE", "IPAD AIR 11 WIFI 256GB STL M4" (chip stays in the type)
 * - Mac codes put the colour after the screen size: "MBN 13 SLV/8GB/512GB-IND" → "MBN 13 8GB/512GB-IND" + "SLV"
 * - Apple Watch: case size ends the type: "APPLE WATCH 11 46 RG AL LB SB" → "APPLE WATCH 11 46" + "RG AL LB SB"
 * Anything else (AirPods, truncated names) is its own type with no colour.
 */
export function splitVariant(description: string): { type: string; color: string } {
  const d = description.replace(/\s+/g, " ").trim();
  const mac = /^(MBA|MBP|MBN|IMAC|MAC ?MINI|MAC ?STUDIO)\b/i.test(d) && d.includes("/");
  if (mac) {
    const [head, ...rest] = d.split("/");
    const words = head.trim().split(" ");
    const last = words[words.length - 1];
    if (words.length >= 3 && /^[A-Z]{2,4}$/i.test(last)) return { type: `${words.slice(0, -1).join(" ")} ${rest.join("/")}`.trim(), color: last };
    return { type: d, color: "" };
  }
  const t = d.split(" ");
  if (/\bWATCH\b/i.test(d)) {
    const i = t.findIndex((w, k) => k >= 2 && WATCH_SIZE.test(w));
    if (i >= 0 && i < t.length - 1) return { type: t.slice(0, i + 1).join(" "), color: t.slice(i + 1).join(" ") };
    return { type: d, color: "" };
  }
  const i = t.findIndex((w, k) => k >= 1 && STORAGE.test(w));
  if (i >= 0 && i < t.length - 1) {
    const rest = t.slice(i + 1);
    const chips = rest.filter((w) => CHIP.test(w));
    const color = rest.filter((w) => !CHIP.test(w)).join(" ");
    if (color) return { type: [...t.slice(0, i + 1), ...chips].join(" "), color };
  }
  return { type: d, color: "" };
}

/** Articles grouped per product type, best-selling type first (same order rule as articles). */
export function typeSales(items: ArticleSale[]): TypeSale[] {
  const map = new Map<string, TypeSale>();
  for (const a of items) {
    const { type, color } = splitVariant(a.description || a.article);
    const g = map.get(type) ?? { type, qty: 0, value: 0, variants: [] };
    g.qty += a.qty;
    g.value += a.value;
    g.variants.push({ ...a, color });
    map.set(type, g);
  }
  return [...map.values()]
    .map((g) => ({ ...g, variants: g.variants.sort((x, y) => y.qty - x.qty || y.value - x.value) }))
    .sort((x, y) => y.qty - x.qty || y.value - x.value);
}
