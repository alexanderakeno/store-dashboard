/**
 * Month-to-month (MTM) comparison. Pure — compares two enriched months over the
 * same day range (like-for-like) so a running month is never measured against
 * a full month. Numbers come from the same `totals` / `staffStats` as every page.
 */
import { GROUPS, type Group, type ISODate, type MonthKey, type SalesLine, type Totals } from "@/types/domain";
import { estimateClosing, growth, totals } from "./kpi";
import { APPLE_LOBS, lobQty, lobValue, staffStats } from "./extra";
import { daysInMonth } from "./period";
import type { MonthInput } from "./views";

type Lob = (typeof APPLE_LOBS)[number];

export interface MtmSide {
  month: MonthKey;
  from: ISODate;
  to: ISODate;
  /** Days in the compared range (1..N). */
  days: number;
  daysInMonth: number;
  totals: Totals;
  /** Monthly target prorated to the range: target × days ÷ daysInMonth. */
  targetProrated: number;
  targetMonth: number;
  achievementPct: number | null;
  lobQty: Record<Lob, number>;
  lobValue: Record<Lob, number>;
  bestDay: { date: ISODate; sales: number } | null;
}

export interface MtmGroupRow {
  group: Group;
  base: number;
  compare: number;
  diff: number;
  growthPct: number | null;
  baseAch: number | null;
  compareAch: number | null;
}

export interface MtmFullRow {
  group: Group | "Total";
  /** Compare month, whole month (or up to its last data date). */
  compareActual: number;
  compareTarget: number;
  compareAch: number | null;
  /** Base month estimate closing (MTD ÷ days × daysInMonth). */
  baseEstimate: number;
  baseTarget: number;
  baseEstAch: number | null;
  growthPct: number | null;
}

export interface MtmStaffRow {
  key: string;
  name: string;
  isChannel: boolean;
  base: Totals | null;
  compare: Totals | null;
  growthPct: number | null;
}

export interface MtmView {
  day: number;
  base: MtmSide;
  compare: MtmSide;
  growth: { sales: number | null; invoices: number | null; qty: number | null; upt: number | null; atv: number | null };
  groups: MtmGroupRow[];
  lob: Array<{ lob: Lob; baseQty: number; compareQty: number; qtyGrowth: number | null; baseValue: number; compareValue: number; valueGrowth: number | null }>;
  full: MtmFullRow[];
  /** True when the compare month has data for its whole month (closed). */
  compareClosed: boolean;
  staff: MtmStaffRow[];
}

const pad = (n: number) => String(n).padStart(2, "0");

function side(m: MonthInput, lastDay: number): MtmSide {
  const dim = daysInMonth(m.month);
  const days = Math.min(lastDay, dim);
  const from = `${m.month}-01`;
  const to = `${m.month}-${pad(days)}`;
  const lines = m.lines.filter((l) => l.date >= from && l.date <= to);
  const t = totals(lines);
  const targetMonth = m.target?.total ?? 0;
  const targetProrated = (targetMonth * days) / dim;
  const perDay = new Map<ISODate, number>();
  for (const l of lines) perDay.set(l.date, (perDay.get(l.date) ?? 0) + l.amount);
  let bestDay: MtmSide["bestDay"] = null;
  for (const [date, sales] of perDay) if (!bestDay || sales > bestDay.sales) bestDay = { date, sales };
  return {
    month: m.month,
    from,
    to,
    days,
    daysInMonth: dim,
    totals: t,
    targetProrated,
    targetMonth,
    achievementPct: targetProrated ? (t.sales / targetProrated) * 100 : null,
    lobQty: lobQty(lines),
    lobValue: lobValue(lines),
    bestDay,
  };
}

const lastDate = (lines: SalesLine[]): ISODate | null => lines.reduce<ISODate | null>((a, l) => (!a || l.date > a ? l.date : a), null);

/**
 * @param base     the month being reviewed (usually the running month)
 * @param baseAsOf its data date; the day-of-month sets the like-for-like range
 * @param compare  the month to compare against (usually the previous month)
 */
export function mtmView(base: MonthInput, baseAsOf: ISODate, compare: MonthInput): MtmView {
  const day = Number(baseAsOf.slice(8, 10));
  const b = side({ ...base, lines: base.lines.filter((l) => l.date <= baseAsOf) }, day);
  const c = side(compare, day);
  const g = (x: number | null, y: number | null) => (x == null || y == null ? null : growth(x, y));

  const groups: MtmGroupRow[] = GROUPS.map((k) => {
    const bt = base.target?.byGroup[k] ?? 0;
    const ct = compare.target?.byGroup[k] ?? 0;
    const bp = (bt * b.days) / b.daysInMonth;
    const cp = (ct * c.days) / c.daysInMonth;
    return {
      group: k,
      base: b.totals.byGroup[k],
      compare: c.totals.byGroup[k],
      diff: b.totals.byGroup[k] - c.totals.byGroup[k],
      growthPct: growth(b.totals.byGroup[k], c.totals.byGroup[k]),
      baseAch: bp ? (b.totals.byGroup[k] / bp) * 100 : null,
      compareAch: cp ? (c.totals.byGroup[k] / cp) * 100 : null,
    };
  });

  const lob = APPLE_LOBS.map((k) => ({
    lob: k,
    baseQty: b.lobQty[k],
    compareQty: c.lobQty[k],
    qtyGrowth: growth(b.lobQty[k], c.lobQty[k]),
    baseValue: b.lobValue[k],
    compareValue: c.lobValue[k],
    valueGrowth: growth(b.lobValue[k], c.lobValue[k]),
  }));

  // Full month: compare month as a whole vs the base month's closing estimate.
  const baseMtd = totals(base.lines.filter((l) => l.date <= baseAsOf));
  const compareAll = totals(compare.lines);
  const est = estimateClosing(baseMtd.sales, base.month, baseAsOf, base.rules.estimateMinDays);
  const estOf = (v: number) => (est.daysElapsed ? (v / est.daysElapsed) * daysInMonth(base.month) : 0);
  const fullRow = (k: Group | "Total"): MtmFullRow => {
    const ca = k === "Total" ? compareAll.sales : compareAll.byGroup[k];
    const ctg = k === "Total" ? compare.target?.total ?? 0 : compare.target?.byGroup[k] ?? 0;
    const be = k === "Total" ? est.value : estOf(baseMtd.byGroup[k]);
    const btg = k === "Total" ? base.target?.total ?? 0 : base.target?.byGroup[k] ?? 0;
    return { group: k, compareActual: ca, compareTarget: ctg, compareAch: ctg ? (ca / ctg) * 100 : null, baseEstimate: be, baseTarget: btg, baseEstAch: btg ? (be / btg) * 100 : null, growthPct: growth(be, ca) };
  };
  const full = [...GROUPS.map(fullRow), fullRow("Total")];
  const cLast = lastDate(compare.lines);
  const compareClosed = !!cLast && cLast.slice(8, 10) === pad(daysInMonth(compare.month));

  // Staff over the same range, matched by staff key (NIK, else name).
  const sb = staffStats(base.lines.filter((l) => l.date >= b.from && l.date <= b.to), null, 0, { includeChannels: true });
  const sc = staffStats(compare.lines.filter((l) => l.date >= c.from && l.date <= c.to), null, 0, { includeChannels: true });
  const map = new Map<string, MtmStaffRow>();
  for (const s of sb) map.set(s.key, { key: s.key, name: s.name, isChannel: s.isChannel, base: s.totals, compare: null, growthPct: null });
  for (const s of sc) {
    const e = map.get(s.key);
    if (e) e.compare = s.totals;
    else map.set(s.key, { key: s.key, name: s.name, isChannel: s.isChannel, base: null, compare: s.totals, growthPct: null });
  }
  const staff = [...map.values()]
    .map((r) => ({ ...r, growthPct: r.base && r.compare ? growth(r.base.sales, r.compare.sales) : null }))
    .sort((x, y) => Number(x.isChannel) - Number(y.isChannel) || (y.base?.sales ?? 0) - (x.base?.sales ?? 0) || (y.compare?.sales ?? 0) - (x.compare?.sales ?? 0));

  return {
    day,
    base: b,
    compare: c,
    growth: {
      sales: growth(b.totals.sales, c.totals.sales),
      invoices: growth(b.totals.invoices, c.totals.invoices),
      qty: growth(b.totals.qty, c.totals.qty),
      upt: g(b.totals.upt, c.totals.upt),
      atv: g(b.totals.atv, c.totals.atv),
    },
    groups,
    lob,
    full,
    compareClosed,
    staff,
  };
}
