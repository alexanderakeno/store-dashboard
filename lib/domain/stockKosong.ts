import type { ISODate, SalesLine } from "@/types/domain";
import type { SohItem } from "@/types/soh";
import { splitVariant } from "./drill";

/** One article that sold in the window but has no stock in the latest SOH. */
export interface EmptyItem {
  article: string;
  description: string;
  /** Units sold in the window (returns net out). */
  sold: number;
  lastSold: ISODate;
  /** Other colours of the same type that ARE in stock (alternative while waiting for the warehouse). */
  alt: Array<{ color: string; qty: number }>;
}

export interface EmptyGroup {
  /** SOH category (iPhone, MacBook, Samsung, …) or the brand when the SOH has no such column. */
  category: string;
  /** False when the SOH PDF has no column for this brand at all. */
  inSoh: boolean;
  sold: number;
  items: EmptyItem[];
}

const LOB_TO_SOH: Record<string, string> = { Mac: "MacBook" };
const key = (s: string) => s.trim().toUpperCase();

/**
 * "Stock Kosong" (need fulfillment): device articles (Apple & Android) sold between `from` and `to`
 * that have no stock in the latest SOH (article missing or qty ≤ 0), grouped per SOH category /
 * brand. Accessories are left out — the SOH PDF does not list them. Busiest group and article first.
 */
export function emptyStock(items: SohItem[], categories: string[], lines: SalesLine[], from: ISODate, to: ISODate): EmptyGroup[] {
  const stock = new Map<string, number>();
  const catOf = new Map<string, string>();
  for (const s of items) {
    const k = key(s.article);
    stock.set(k, (stock.get(k) ?? 0) + s.qty);
    catOf.set(k, s.category);
  }
  const cats = new Map(categories.map((c) => [key(c), c]));

  const sold = new Map<string, { article: string; description: string; category: string; sold: number; lastSold: ISODate }>();
  for (const l of lines) {
    if (l.date < from || l.date > to || !l.article || (l.group !== "Apple" && l.group !== "Android")) continue;
    const k = key(l.article);
    let s = sold.get(k);
    if (!s) {
      const lob = l.lob ?? l.brand;
      const category = catOf.get(k) ?? cats.get(key(LOB_TO_SOH[lob] ?? lob)) ?? LOB_TO_SOH[lob] ?? lob;
      sold.set(k, (s = { article: l.article.trim(), description: l.description.trim(), category, sold: 0, lastSold: l.date }));
    }
    s.sold += l.qty;
    if (l.qty > 0 && l.date > s.lastSold) s.lastSold = l.date;
    if (!s.description && l.description) s.description = l.description.trim();
  }

  // in-stock colours per type, for "warna lain ready"
  const ready = new Map<string, Array<{ color: string; qty: number }>>();
  for (const s of items) {
    if (s.qty <= 0) continue;
    const { type, color } = splitVariant(s.description || s.article);
    const k = `${key(s.category)}|${key(type)}`;
    const list = ready.get(k) ?? [];
    const same = list.find((x) => x.color === (color || s.article));
    if (same) same.qty += s.qty;
    else list.push({ color: color || s.article, qty: s.qty });
    ready.set(k, list);
  }

  const groups = new Map<string, EmptyGroup>();
  for (const [k, s] of sold) {
    if (s.sold <= 0 || (stock.get(k) ?? 0) > 0) continue;
    const { type } = splitVariant(s.description || s.article);
    const alt = [...(ready.get(`${key(s.category)}|${key(type)}`) ?? [])].sort((a, b) => b.qty - a.qty);
    let g = groups.get(s.category);
    if (!g) groups.set(s.category, (g = { category: s.category, inSoh: cats.has(key(s.category)), sold: 0, items: [] }));
    g.sold += s.sold;
    g.items.push({ article: s.article, description: s.description, sold: s.sold, lastSold: s.lastSold, alt });
  }
  const order = new Map(categories.map((c, i) => [c, i]));
  for (const g of groups.values()) g.items.sort((a, b) => b.sold - a.sold || b.lastSold.localeCompare(a.lastSold) || a.description.localeCompare(b.description));
  return [...groups.values()].sort((a, b) => b.sold - a.sold || (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || a.category.localeCompare(b.category));
}

/** Plain-text request for the warehouse team (WhatsApp friendly). */
export function fulfillmentText(groups: EmptyGroup[], meta: { store: string; from: ISODate; to: ISODate; sohDate: ISODate | null }): string {
  const d = (x: ISODate) => `${x.slice(8, 10)}/${x.slice(5, 7)}`;
  const out = [`*Need fulfillment ${meta.store}*`.trim(), `Stok kosong di SOH${meta.sohDate ? ` ${d(meta.sohDate)}` : ""}, terjual ${d(meta.from)}–${d(meta.to)}:`];
  for (const g of groups) {
    out.push("", `*${g.category}*`);
    for (const it of g.items) out.push(`- ${it.description || it.article} (${it.article}) · sold ${it.sold}`);
  }
  return out.join("\n");
}
