import type { BusinessRules } from "@/config/business";
import type { MerchLine, SalesLine } from "@/types/domain";
import { classify } from "./classify";

/**
 * Last-year months imported from a Merchandise Report (no Sales Person file): every MR line becomes
 * a sales line with the MR qty and net, classified with the same rules as the current year, so
 * LFL / YTD / Compare can use them. There is no staff, invoice or channel information.
 */
export function historyLines(merch: MerchLine[], rules: BusinessRules): SalesLine[] {
  return merch.map((m) => {
    const raw = { date: m.date, nik: null, staffName: "", article: m.article, description: m.description, invoice: "", amount: m.net, type: m.productGroup, brand: m.brand, category: m.category };
    const c = classify(raw, rules);
    return { ...raw, ...c, isChannel: false, qty: m.qty, qtySource: "exact" as const };
  });
}

/** Last day (1–31) with sales in `lines` (0 = no lines). */
export function lastDay(lines: SalesLine[]): number {
  let d = 0;
  for (const l of lines) d = Math.max(d, Number(l.date.slice(8, 10)) || 0);
  return d;
}

/** Days in month `YYYY-MM`. */
const monthDays = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/**
 * Fair year-over-year pair for one month: when either side stops before the month's end (current
 * month still running, or an imported file that ends mid-month), both sides are cut to the same last
 * day. `upTo` = that day, or null when both months are complete.
 */
export function sameRange(month: string, prevMonth: string, cur: SalesLine[] | undefined, prev: SalesLine[] | undefined): { cur?: SalesLine[]; prev?: SalesLine[]; upTo: number | null } {
  if (!cur || !prev) return { cur, prev, upTo: null };
  const c = lastDay(cur);
  const p = lastDay(prev);
  const cutC = c < monthDays(month) ? c : 99;
  const cutP = p < monthDays(prevMonth) ? p : 99;
  const upTo = Math.min(cutC, cutP);
  if (upTo === 99) return { cur, prev, upTo: null };
  const cut = (ls: SalesLine[]) => ls.filter((l) => Number(l.date.slice(8, 10)) <= upTo);
  return { cur: cut(cur), prev: cut(prev), upTo };
}
