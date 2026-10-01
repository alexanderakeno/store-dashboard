/**
 * Page view-models. Pure functions over an enriched month — every page gets
 * its numbers from here so the same KPI is computed the same way everywhere.
 */
import type { BusinessRules } from "@/config/business";
import { GROUPS, type Achievement, type Group, type ISODate, type MonthKey, type SalesLine, type StoreTarget, type Totals, type TrafficEntry } from "@/types/domain";
import { achievement, breakdown, byStaff, estimateClosing, invoices, points, totals, type InvoiceRow, type PointResult, type StaffRow } from "./kpi";
import { nameKey } from "./normalize";
import { daysInMonth, eachDay, monthStart, weeksOfMonth, type WeekRange } from "./period";

export interface MonthInput {
  month: MonthKey;
  lines: SalesLine[];
  target: StoreTarget | null;
  traffic: TrafficEntry[];
  rules: BusinessRules;
}

const zero = (): Record<Group, number> => ({ Apple: 0, Android: 0, ACC: 0, VAS: 0 });
const ratio = (a: number, b: number) => (b ? a / b : null);

export function targetByGroup(t: StoreTarget | null): Record<Group, number> {
  return t ? { ...t.byGroup } : zero();
}

/** Last date with any sales line (data is usually imported up to yesterday). */
export function lastDataDate(lines: SalesLine[]): ISODate | null {
  let max: ISODate | null = null;
  for (const l of lines) if (!max || l.date > max) max = l.date;
  return max;
}

/** CVR only over days that have traffic, so missing input doesn't understate it. */
export function conversion(lines: SalesLine[], traffic: TrafficEntry[], start: ISODate, end: ISODate) {
  const days = new Set(traffic.filter((t) => t.date >= start && t.date <= end && t.traffic > 0).map((t) => t.date));
  const trafficSum = traffic.filter((t) => days.has(t.date)).reduce((a, t) => a + t.traffic, 0);
  const inv = new Set(lines.filter((l) => days.has(l.date) && l.invoice).map((l) => l.invoice));
  return { traffic: trafficSum, transactions: inv.size, cvr: trafficSum ? (inv.size / trafficSum) * 100 : null, daysWithTraffic: days.size };
}

/** AR VAS = VAS (Qoala) qty ÷ device qty. */
export function attachRate(lines: SalesLine[], provider = "Qoala"): { vasQty: number; deviceQty: number; ar: number | null } {
  let vasQty = 0;
  let deviceQty = 0;
  for (const l of lines) {
    if (l.vasProvider === provider) vasQty += l.qty;
    if (l.type === "DEVICES") deviceQty += l.qty;
  }
  return { vasQty, deviceQty, ar: deviceQty ? (vasQty / deviceQty) * 100 : null };
}

export interface GroupRow {
  group: Group;
  actual: number;
  target: number;
  achievementPct: number | null;
  gap: number;
  estimate: number;
  estimatePct: number | null;
  qty: number;
  point: number;
  pointCap: number;
  estPoint: number;
}

export interface HomeView {
  month: MonthKey;
  asOf: ISODate;
  daysElapsed: number;
  daysInMonth: number;
  estimateStable: boolean;
  totals: Totals;
  achievement: Achievement;
  estimate: number;
  estimatePct: number | null;
  dailyTarget: number;
  /** Required average per remaining day to hit target. */
  requiredPerDay: number | null;
  groups: GroupRow[];
  points: PointResult;
  cvr: ReturnType<typeof conversion>;
  ar: ReturnType<typeof attachRate>;
  day: { date: ISODate; totals: Totals; achievement: Achievement };
  series: Array<{ date: ISODate; sales: number; target: number }>;
  topStaff: StaffRow[];
}

export function homeView(m: MonthInput, asOf: ISODate): HomeView {
  const dim = daysInMonth(m.month);
  const mtd = m.lines.filter((l) => l.date <= asOf);
  const t = totals(mtd);
  const tg = targetByGroup(m.target);
  const targetTotal = m.target?.total ?? 0;
  const est = estimateClosing(t.sales, m.month, asOf, m.rules.estimateMinDays);
  const estByGroup = zero();
  for (const g of GROUPS) estByGroup[g] = est.daysElapsed ? (t.byGroup[g] / est.daysElapsed) * dim : 0;
  const p = points(t.byGroup, estByGroup, tg, m.month, m.rules);
  const groups: GroupRow[] = GROUPS.map((g) => ({
    group: g,
    actual: t.byGroup[g],
    target: tg[g],
    achievementPct: tg[g] ? (t.byGroup[g] / tg[g]) * 100 : null,
    gap: t.byGroup[g] - tg[g],
    estimate: estByGroup[g],
    estimatePct: tg[g] ? (estByGroup[g] / tg[g]) * 100 : null,
    qty: t.qtyByGroup[g],
    point: p.byGroup[g],
    pointCap: m.rules.pointCaps[g],
    estPoint: p.estimateByGroup[g],
  }));
  const dailyTarget = targetTotal / dim;
  const dayLines = m.lines.filter((l) => l.date === asOf);
  const dayTotals = totals(dayLines);
  const remainingDays = dim - est.daysElapsed;
  const series = eachDay(monthStart(m.month), asOf).map((d) => ({
    date: d,
    sales: m.lines.reduce((a, l) => (l.date === d ? a + l.amount : a), 0),
    target: dailyTarget,
  }));
  return {
    month: m.month,
    asOf,
    daysElapsed: est.daysElapsed,
    daysInMonth: dim,
    estimateStable: est.stable,
    totals: t,
    achievement: achievement(t.sales, targetTotal),
    estimate: est.value,
    estimatePct: targetTotal ? (est.value / targetTotal) * 100 : null,
    dailyTarget,
    requiredPerDay: remainingDays > 0 ? Math.max(0, targetTotal - t.sales) / remainingDays : null,
    groups,
    points: p,
    cvr: conversion(mtd, m.traffic, monthStart(m.month), asOf),
    ar: attachRate(mtd),
    day: { date: asOf, totals: dayTotals, achievement: achievement(dayTotals.sales, dailyTarget) },
    series,
    topStaff: byStaff(mtd, m.target).staff.slice(0, 5),
  };
}

export interface DailyRow {
  date: ISODate;
  totals: Totals;
  target: number;
  achievementPct: number | null;
  traffic: number | null;
  cvr: number | null;
  cumSales: number;
  cumAchievementPct: number | null;
}

export function dailyRows(m: MonthInput, asOf: ISODate): DailyRow[] {
  const dim = daysInMonth(m.month);
  const dailyTarget = (m.target?.total ?? 0) / dim;
  const byDate = new Map<ISODate, SalesLine[]>();
  for (const l of m.lines) {
    const list = byDate.get(l.date) ?? [];
    list.push(l);
    byDate.set(l.date, list);
  }
  const trafficOf = new Map(m.traffic.map((t) => [t.date, t.traffic]));
  let cum = 0;
  return eachDay(monthStart(m.month), asOf).map((date, i) => {
    const t = totals(byDate.get(date) ?? []);
    cum += t.sales;
    const traffic = trafficOf.get(date) ?? null;
    return {
      date,
      totals: t,
      target: dailyTarget,
      achievementPct: ratio(t.sales * 100, dailyTarget),
      traffic,
      cvr: traffic ? (t.invoices / traffic) * 100 : null,
      cumSales: cum,
      cumAchievementPct: ratio(cum * 100, dailyTarget * (i + 1)),
    };
  });
}

export interface DayDetail {
  date: ISODate;
  totals: Totals;
  invoices: Array<InvoiceRow & { items: SalesLine[] }>;
  byStaff: StaffRow[];
  channels: StaffRow[];
}

export function dayDetail(m: MonthInput, date: ISODate): DayDetail {
  const ls = m.lines.filter((l) => l.date === date);
  const inv = invoices(ls).map((r) => ({ ...r, items: ls.filter((l) => l.invoice === r.invoice) }));
  const { staff, channels } = byStaff(ls, null);
  return { date, totals: totals(ls), invoices: inv, byStaff: staff, channels };
}

export interface StaffView {
  staff: StaffRow[];
  channels: StaffRow[];
  store: Totals;
  estimateFactor: number;
}

export function staffView(m: MonthInput, asOf: ISODate): StaffView {
  const mtd = m.lines.filter((l) => l.date <= asOf);
  const { staff, channels } = byStaff(mtd, m.target);
  const est = estimateClosing(1, m.month, asOf, m.rules.estimateMinDays);
  return { staff, channels, store: totals(mtd), estimateFactor: est.value };
}

export interface FocusRow {
  key: string;
  actual: number;
  qty: number;
  target: number;
  achievementPct: number | null;
  gap: number;
  inTarget: boolean;
}

export interface FocusSection {
  group: Group;
  title: string;
  rows: FocusRow[];
  actual: number;
  target: number;
}

const TITLES: Record<Group, string> = { Apple: "Apple LOB", Android: "Android per brand", ACC: "ACC per supplier", VAS: "VAS per provider" };

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Key of a line inside a focus section (null = not part of the section). */
export function focusKey(group: Group, l: SalesLine): string | null {
  switch (group) {
    case "Apple":
      // AirPods are counted in ACC but displayed in the Apple LOB
      return l.brand === "APPLE" && (l.group === "Apple" || l.lob === "AirPods") ? l.lob ?? "Apple Other" : null;
    case "Android":
      return l.group === "Android" ? l.lob : null;
    case "ACC":
      return l.group === "ACC" ? l.supplier ?? title(l.brand) : null;
    case "VAS":
      return l.group === "VAS" ? l.vasProvider : null;
  }
}

export function focusView(m: MonthInput, asOf: ISODate): FocusSection[] {
  const mtd = m.lines.filter((l) => l.date <= asOf);
  return GROUPS.map((g) => {
    const section = m.target?.sections[g];
    const actualRows = breakdown(mtd, (l) => focusKey(g, l));
    const used = new Set<string>();
    const rows: FocusRow[] = [];
    const cols = section?.columns ?? [];
    const extra = g === "ACC" ? m.rules.supplierOrder.filter((s) => !cols.some((c) => nameKey(c) === nameKey(s))) : [];
    for (const col of [...cols, ...extra]) {
      const matches = actualRows.filter((r) => nameKey(r.key) === nameKey(col));
      matches.forEach((r) => used.add(r.key));
      const actual = matches.reduce((a, r) => a + r.sales, 0);
      const target = section?.columnTargets[col] ?? 0;
      rows.push({ key: col, actual, qty: matches.reduce((a, r) => a + r.qty, 0), target, achievementPct: ratio(actual * 100, target), gap: actual - target, inTarget: cols.includes(col) });
    }
    for (const r of actualRows) {
      if (used.has(r.key) || r.sales === 0) continue; // e.g. free shopping bags
      rows.push({ key: r.key, actual: r.sales, qty: r.qty, target: 0, achievementPct: null, gap: r.sales, inTarget: false });
    }
    // In the Apple LOB AirPods appear for visibility but their value belongs to ACC.
    const actual = rows.filter((r) => !(g === "Apple" && r.key === "AirPods")).reduce((a, r) => a + r.actual, 0);
    return { group: g, title: TITLES[g], rows, actual, target: section?.total ?? targetByGroup(m.target)[g] };
  });
}

export interface WeekRow extends WeekRange {
  days: number;
  daysWithData: number;
  totals: Totals;
  target: number;
  achievementPct: number | null;
  cvr: number | null;
}

export function weeklyView(m: MonthInput, asOf: ISODate): WeekRow[] {
  const dailyTarget = (m.target?.total ?? 0) / daysInMonth(m.month);
  return weeksOfMonth(m.month).map((w) => {
    const days = eachDay(w.start, w.end).length;
    const end = w.end < asOf ? w.end : asOf;
    const ls = m.lines.filter((l) => l.date >= w.start && l.date <= end);
    const t = totals(ls);
    const target = dailyTarget * days;
    return {
      ...w,
      days,
      daysWithData: end >= w.start ? eachDay(w.start, end).length : 0,
      totals: t,
      target,
      achievementPct: ratio(t.sales * 100, target),
      cvr: conversion(ls, m.traffic, w.start, end).cvr,
    };
  });
}
