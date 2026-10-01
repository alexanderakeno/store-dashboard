import type { BusinessRules } from "@/config/business";
import { GROUPS, type Achievement, type Group, type ISODate, type MerchLine, type MonthKey, type SalesLine, type SalesLineRaw, type StoreTarget, type Totals } from "@/types/domain";
import { classify } from "./classify";
import { nameKey } from "./normalize";
import { daysInMonth } from "./period";
import { buildPriceBook, inferQty, type PriceBook } from "./qty";

const zero = (): Record<Group, number> => ({ Apple: 0, Android: 0, ACC: 0, VAS: 0 });
const ratio = (a: number, b: number): number | null => (b ? a / b : null);

/** Normalize → classify → infer qty. Single pipeline used by every view. */
export function enrichSales(raw: SalesLineRaw[], merch: MerchLine[], rules: BusinessRules, historical?: PriceBook): SalesLine[] {
  const book = buildPriceBook(merch, historical);
  return raw.map((l) => {
    const c = classify(l, rules);
    const q = inferQty(l.article, l.amount, book);
    return { ...l, ...c, qty: q.qty, qtySource: q.source };
  });
}

export function totals(lines: SalesLine[]): Totals {
  const byGroup = zero();
  const qtyByGroup = zero();
  const invoices = new Set<string>();
  let sales = 0;
  let qty = 0;
  for (const l of lines) {
    sales += l.amount;
    byGroup[l.group] += l.amount;
    if (l.countsInQty) {
      qty += l.qty;
      qtyByGroup[l.group] += l.qty;
    }
    if (l.invoice) invoices.add(l.invoice);
  }
  return {
    sales,
    byGroup,
    qty,
    qtyByGroup,
    invoices: invoices.size,
    upt: ratio(qty, invoices.size),
    atv: ratio(sales, invoices.size),
    lines: lines.length,
  };
}

export function achievement(actual: number, target: number): Achievement {
  return { actual, target, achievementPct: target ? (actual / target) * 100 : null, gap: actual - target };
}

/** Closing estimate: MTD ÷ days elapsed × days in month. */
export function estimateClosing(mtd: number, month: MonthKey, asOf: ISODate, minDays: number): { value: number; daysElapsed: number; stable: boolean } {
  const dim = daysInMonth(month);
  const daysElapsed = asOf.slice(0, 7) < month ? 0 : asOf.slice(0, 7) > month ? dim : Number(asOf.slice(8, 10));
  const value = daysElapsed ? (mtd / daysElapsed) * dim : 0;
  return { value, daysElapsed, stable: daysElapsed >= minDays };
}

/** Point = MIN(MTD ÷ (Target ÷ daysInMonth), cap) — same as the sheet (Data - Akeno L74:M79). */
export function point(actual: number, target: number, month: MonthKey, cap: number): number {
  if (!target) return 0;
  return Math.min(actual / (target / daysInMonth(month)), cap);
}

export interface PointResult {
  byGroup: Record<Group, number>;
  total: number;
  estimateByGroup: Record<Group, number>;
  estimateTotal: number;
  max: number;
}

export function points(actual: Record<Group, number>, estimate: Record<Group, number>, target: Record<Group, number>, month: MonthKey, rules: BusinessRules): PointResult {
  const byGroup = zero();
  const estimateByGroup = zero();
  for (const g of GROUPS) {
    byGroup[g] = point(actual[g], target[g], month, rules.pointCaps[g]);
    estimateByGroup[g] = point(estimate[g], target[g], month, rules.pointCaps[g]);
  }
  const sum = (r: Record<Group, number>) => GROUPS.reduce((a, g) => a + r[g], 0);
  return { byGroup, total: sum(byGroup), estimateByGroup, estimateTotal: sum(estimateByGroup), max: sum(rules.pointCaps) };
}

export interface StaffRow {
  key: string;
  nik: string | null;
  name: string;
  isChannel: boolean;
  totals: Totals;
  target: number;
  targetByGroup: Record<Group, number>;
  achievement: Achievement;
}

/** Per-staff aggregation. Channels (online) are returned separately. */
export function byStaff(lines: SalesLine[], target: StoreTarget | null, targetScale = 1): { staff: StaffRow[]; channels: StaffRow[] } {
  const groups = new Map<string, SalesLine[]>();
  const meta = new Map<string, { nik: string | null; name: string; isChannel: boolean }>();
  for (const l of lines) {
    const key = l.nik ?? `name:${nameKey(l.staffName)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
    if (!meta.has(key)) meta.set(key, { nik: l.nik, name: l.staffName, isChannel: l.isChannel });
  }
  // staff with targets but no sales yet
  for (const st of target?.staff ?? []) {
    const k = [...meta.entries()].find(([, m]) => nameKey(m.name) === nameKey(st.name))?.[0];
    if (!k && st.total > 0) {
      const key = `name:${nameKey(st.name)}`;
      groups.set(key, []);
      meta.set(key, { nik: null, name: st.name, isChannel: false });
    }
  }
  const rows: StaffRow[] = [...groups.entries()].map(([key, ls]) => {
    const m = meta.get(key)!;
    const st = target?.staff.find((s) => nameKey(s.name) === nameKey(m.name));
    const tByGroup = zero();
    for (const g of GROUPS) tByGroup[g] = (st?.byGroup[g] ?? 0) * targetScale;
    const t = (st?.total ?? 0) * targetScale;
    const tot = totals(ls);
    return { key, nik: m.nik, name: m.name, isChannel: m.isChannel, totals: tot, target: t, targetByGroup: tByGroup, achievement: achievement(tot.sales, t) };
  });
  rows.sort((a, b) => (b.achievement.achievementPct ?? -1) - (a.achievement.achievementPct ?? -1) || b.totals.sales - a.totals.sales);
  return { staff: rows.filter((r) => !r.isChannel), channels: rows.filter((r) => r.isChannel) };
}

export interface BreakdownRow {
  key: string;
  sales: number;
  qty: number;
  invoices: number;
}

export function breakdown(lines: SalesLine[], keyOf: (l: SalesLine) => string | null, opts: { qtyAll?: boolean } = {}): BreakdownRow[] {
  const map = new Map<string, { sales: number; qty: number; inv: Set<string> }>();
  for (const l of lines) {
    const k = keyOf(l);
    if (!k) continue;
    const e = map.get(k) ?? { sales: 0, qty: 0, inv: new Set<string>() };
    e.sales += l.amount;
    if (opts.qtyAll || l.countsInQty) e.qty += l.qty;
    if (l.invoice) e.inv.add(l.invoice);
    map.set(k, e);
  }
  return [...map.entries()].map(([key, e]) => ({ key, sales: e.sales, qty: e.qty, invoices: e.inv.size })).sort((a, b) => b.sales - a.sales);
}

export interface InvoiceRow {
  invoice: string;
  date: ISODate;
  staffName: string;
  qty: number;
  value: number;
  lines: number;
}

/** One row per unique invoice. */
export function invoices(lines: SalesLine[]): InvoiceRow[] {
  const map = new Map<string, InvoiceRow>();
  for (const l of lines) {
    if (!l.invoice) continue;
    const e = map.get(l.invoice) ?? { invoice: l.invoice, date: l.date, staffName: l.staffName, qty: 0, value: 0, lines: 0 };
    e.value += l.amount;
    if (l.countsInQty) e.qty += l.qty;
    e.lines++;
    map.set(l.invoice, e);
  }
  return [...map.values()].sort((a, b) => (a.date === b.date ? b.invoice.localeCompare(a.invoice) : b.date.localeCompare(a.date)));
}

export function filterDates(lines: SalesLine[], start: ISODate, end: ISODate): SalesLine[] {
  return lines.filter((l) => l.date >= start && l.date <= end);
}

export function growth(current: number, previous: number): number | null {
  return previous ? ((current - previous) / previous) * 100 : null;
}
