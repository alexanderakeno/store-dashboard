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
