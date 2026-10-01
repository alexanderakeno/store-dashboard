import type { MerchLine, QtySource } from "@/types/domain";

/**
 * The Sales Person export has no qty column. Each SP line amount is
 * qty × unit price, so qty is inferred from known unit prices of the article
 * (Merchandise Report of the month first, then historical prices).
 */
export type PriceBook = Map<string, number[]>; // article → distinct unit prices, high → low

export function buildPriceBook(merch: MerchLine[], historical: PriceBook = new Map()): PriceBook {
  const book: PriceBook = new Map();
  const add = (article: string, price: number) => {
    if (!(price > 0)) return;
    const p = Math.round(price);
    const list = book.get(article) ?? [];
    if (!list.includes(p)) list.push(p);
    book.set(article, list);
  };
  for (const m of merch) if (m.qty > 0 && m.net > 0) add(m.article, m.net / m.qty);
  for (const [article, prices] of historical) for (const p of prices) add(article, p);
  for (const list of book.values()) list.sort((a, b) => b - a);
  return book;
}

export function inferQty(article: string, amount: number, book: PriceBook): { qty: number; source: QtySource } {
  if (amount === 0) return { qty: 1, source: "free" };
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  const prices = book.get(article) ?? [];
  for (const p of prices) {
    const q = abs / p;
    const r = Math.round(q);
    if (r >= 1 && Math.abs(q - r) < 1e-6) return { qty: sign * r, source: "exact" };
  }
  return { qty: sign, source: "uncertain" };
}

/** Per-article comparison of inferred SP qty vs Merchandise Report qty. */
export function reconcileQty(
  merch: MerchLine[],
  sales: Array<{ article: string; qty: number }>,
): Array<{ article: string; merchQty: number; salesQty: number }> {
  const m = new Map<string, number>();
  const s = new Map<string, number>();
  for (const l of merch) m.set(l.article, (m.get(l.article) ?? 0) + l.qty);
  for (const l of sales) s.set(l.article, (s.get(l.article) ?? 0) + l.qty);
  const out: Array<{ article: string; merchQty: number; salesQty: number }> = [];
  for (const article of new Set([...m.keys(), ...s.keys()])) {
    const merchQty = m.get(article) ?? 0;
    const salesQty = s.get(article) ?? 0;
    if (merchQty !== salesQty) out.push({ article, merchQty, salesQty });
  }
  return out;
}
