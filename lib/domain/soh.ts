import type { ISODate, SalesLine } from "@/types/domain";
import type { SohItem } from "@/types/soh";

export type Balance = "unsold" | "low" | "ok" | "slow";

export interface SohRow extends SohItem {
  /** Units sold this month up to the as-of date (Sales Person, inferred qty; returns net out). */
  sold: number;
  /** Days of stock at the month's sales pace (null when nothing sold). */
  coverDays: number | null;
  balance: Balance;
}

/** Cover below this many days = low stock; above SLOW_DAYS = slow mover. */
export const LOW_DAYS = 7;
export const SLOW_DAYS = 60;

/** Joins SOH articles with month-to-date sales (by article code) for the SOH tab. */
export function sohRows(items: SohItem[], lines: SalesLine[], asOf: ISODate): SohRow[] {
  const sold = new Map<string, number>();
  for (const l of lines) {
    if (l.date > asOf || !l.article) continue;
    const k = l.article.toUpperCase();
    sold.set(k, (sold.get(k) ?? 0) + l.qty);
  }
  const days = Math.max(1, Number(asOf.slice(8, 10)));
  return items.map((it) => {
    const s = sold.get(it.article.toUpperCase()) ?? 0;
    const coverDays = s > 0 ? it.qty / (s / days) : null;
    const balance: Balance = coverDays === null ? "unsold" : coverDays < LOW_DAYS ? "low" : coverDays > SLOW_DAYS ? "slow" : "ok";
    return { ...it, sold: s, coverDays, balance };
  });
}
