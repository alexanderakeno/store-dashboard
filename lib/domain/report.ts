/**
 * Data for the Weekly / Closing PPT (Overview → Buat PPT). Pure: the same enriched lines, targets and
 * rules as every page, shaped per slide. The deck itself is drawn in lib/report/pptx.ts.
 *
 * Mode follows the calendar: when the month is over (data up to its last day, or today is in a later
 * month) the deck is a "Closing" and compares with the whole previous month; while the month is still
 * running it is a "Weekly Report" and every comparison uses the same days (1–N) of the other month.
 */
import { GROUPS, type Group, type ISODate, type MonthKey, type SalesLine, type StoreTarget, type TrafficEntry } from "@/types/domain";
import { totals } from "./kpi";
import { lobBreakdown, type QV } from "./extra";
import { displayName, nameKey } from "./normalize";
import { daysInMonth, eachDay, monthEnd, monthStart, prevMonth, sameMonthLastYear, weeksOfMonth } from "./period";
import { conversion } from "./views";

export type ReportMode = "closing" | "weekly";
export type SlideId = "cover" | "target" | "staff" | "balance" | "android" | "apple" | "accvas" | "productivity" | "weekly" | "npi" | "bnpl" | "ytd" | "lob" | "issue" | "thanks";
export const SLIDES: Array<{ id: SlideId; label: string; manual?: boolean }> = [
  { id: "cover", label: "Cover" },
  { id: "target", label: "Target & Achievement MTM – LFL" },
  { id: "staff", label: "Target & Achievement per Staff" },
  { id: "balance", label: "Brand Balance & Contribution" },
  { id: "android", label: "Staff Android per brand" },
  { id: "apple", label: "Staff Apple per LOB" },
  { id: "accvas", label: "ACC & VAS vs MTM" },
  { id: "productivity", label: "Compare Productivity" },
  { id: "weekly", label: "Weekly Performance" },
  { id: "npi", label: "NPI iPhone", manual: true },
  { id: "bnpl", label: "Kontribusi BNPL" },
  { id: "ytd", label: "YTD Performance" },
  { id: "lob", label: "Breakdown LOB per Brand" },
  { id: "issue", label: "Issue & Feedback" },
  { id: "thanks", label: "Thank You" },
];

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const mName = (m: MonthKey) => MONTHS[Number(m.slice(5, 7)) - 1];
const mShort = (m: MonthKey) => MONTHS_SHORT[Number(m.slice(5, 7)) - 1];
const ratio = (a: number, b: number) => (b ? a / b : null);
const growthPct = (a: number, b: number) => (b ? (a / b - 1) * 100 : null);
const zeroG = (): Record<Group, number> => ({ Apple: 0, Android: 0, ACC: 0, VAS: 0 });

/** Apple LOBs on the staff slide (AirPods are ACC there, like the target sheet). */
export const STAFF_APPLE_LOBS = ["iPhone", "iPad", "Apple Watch", "Mac"] as const;
export const LOB_LABEL: Record<string, string> = { iPhone: "iPhone", iPad: "iPad", "Apple Watch": "Apple watch", Mac: "Macbook", AirPods: "Airpods" };
export const BNPL_PROVIDERS = ["Kredivo", "HCI", "Akulaku", "SPayLater", "Indodana"] as const;
export const BNPL_LABEL: Record<string, string> = { SPayLater: "Shopee (SPayLater)" };

export interface StaffLine {
  /** nameKey of the row; "__online" for the online channels, "__other" for anyone else. */
  key: string;
  name: string;
  kind: "staff" | "online" | "other";
}

export interface StaffRowData extends StaffLine {
  target: Record<Group, number>;
  targetTotal: number;
  actual: Record<Group, number>;
  total: number;
  achPct: number | null;
  invoices: number;
  qty: number;
  atv: number | null;
  upt: number | null;
  /** Android per brand / Apple per LOB: qty + value. */
  android: Record<string, QV>;
  apple: Record<string, QV>;
  accEx: number;
  airpods: number;
  vas: Record<string, number>;
}

export interface AccVasRow {
  name: string;
  accEx: number;
  accExPrev: number;
  airpods: number;
  airpodsPrev: number;
  qoala: number;
  qoalaPrev: number;
  telkomsel: number;
  xl: number;
  indosat: number;
  vasTotal: number;
}

export interface ProductivitySide {
  amount: number;
  dailyAvg: number;
  balance: [number, number] | null;
  invoices: number;
  traffic: number | null;
  upt: number | null;
  cvr: number | null;
  atv: number | null;
}

export interface WeekCol {
  label: string;
  period: string;
  sales: number;
  target: number;
  achPct: number | null;
  trx: number;
  upt: number | null;
  atv: number | null;
  vsPrev: number | null;
}

export interface LobRow {
  label: string;
  kind: "apple" | "android" | "totalApple" | "totalAndroid";
  cur: QV;
  prev: QV;
}

export interface YtdRow {
  label: string;
  prev: QV | null;
  cur: QV | null;
  /** Day both sides were cut to (running month / file ending mid-month). */
  upTo: number | null;
}

export interface GroupCompare {
  group: Group | "Amount";
  target: number;
  mtd: number;
  achPct: number | null;
  mtm: number | null;
  mtmGrowth: number | null;
  lfl: number | null;
  lflGrowth: number | null;
}

export interface ReportData {
  storeCode: string;
  storeName: string;
  month: MonthKey;
  mode: ReportMode;
  asOf: ISODate;
  /** Last day included (1..N). */
  day: number;
  daysInMonth: number;
  weekIndex: number;
  timeGonePct: number;
  /** "Closing Oktober 2026" · "Weekly Report W2 November 2026". */
  title: string;
  /** "Oktober" · "1–7 November". */
  curLabel: string;
  /** "September" · "1–7 Oktober". */
  prevLabel: string;
  prevShort: string;
  lyShort: string;
  monthName: string;
  year: string;
  hasPrev: boolean;
  hasLy: boolean;
  groups: GroupCompare[];
  staff: StaffRowData[];
  storeTotals: { invoices: number; atv: number | null; upt: number | null; rowInvoices: number; total: number; target: number; targetByGroup: Record<Group, number>; actual: Record<Group, number> };
  balance: { value: [number, number] | null; qty: [number, number] | null };
  androidBrands: string[];
  appleLobs: string[];
  accVas: AccVasRow[];
  productivity: { cur: ProductivitySide; prev: ProductivitySide | null };
  weeks: WeekCol[];
  weeksTotal: { sales: number; target: number; achPct: number | null; trx: number; upt: number | null; atv: number | null; mtmGrowth: number | null; period: string };
  bnpl: { rows: Array<{ provider: string; label: string; value: number; qty: number }>; value: number; qty: number };
  ytd: YtdRow[];
  ytdYears: [string, string];
  lob: LobRow[];
  issues: string[];
}

export interface ReportInput {
  storeCode: string;
  storeName: string;
  month: MonthKey;
  asOf: ISODate;
  today: ISODate;
  lines: SalesLine[];
  target: StoreTarget | null;
  traffic: TrafficEntry[];
  /** Previous month (whole month, the builder cuts it). */
  prev: { lines: SalesLine[]; traffic: TrafficEntry[] } | null;
  /** Same month last year (whole month). */
  ly: SalesLine[] | null;
  /** YTD: lines per month of both years (`YYYY-MM` → lines). */
  ytd: Map<MonthKey, SalesLine[]>;
  bnpl: Array<{ key: string; data: Record<string, unknown> }>;
}

/* ---------------- helpers ---------------- */

const qvAdd = (t: QV, l: SalesLine, unit = l.countsInQty) => {
  t.value += l.amount;
  if (unit) t.qty += l.qty;
};

/** Rp12,02 M · Rp751,2 jt — for the auto-written issue text. */
export function rpShort(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  const f = (x: number, d: number) => x.toFixed(d).replace(".", ",");
  if (a >= 1e9) return `${s}Rp${f(a / 1e9, 2)} M`;
  if (a >= 1e6) return `${s}Rp${f(a / 1e6, 1)} jt`;
  return `${s}Rp${Math.round(a).toLocaleString("id-ID")}`;
}
const pc0 = (n: number | null) => (n == null ? "–" : `${Math.round(n)}%`);
const signed = (n: number | null) => (n == null ? "–" : `${n >= 0 ? "+" : ""}${Math.round(n)}%`);

/** "1-3 Okt", "4-10 Okt", "31 Okt". */
function span(start: ISODate, end: ISODate, month: MonthKey): string {
  const a = Number(start.slice(8, 10));
  const b = Number(end.slice(8, 10));
  return a === b ? `${a} ${mShort(month)}` : `${a}-${b} ${mShort(month)}`;
}

function balanceOf(byValue: Record<Group, number>): [number, number] | null {
  const t = byValue.Apple + byValue.Android;
  return t ? [(byValue.Apple / t) * 100, (byValue.Android / t) * 100] : null;
}

/* ---------------- builder ---------------- */

export function buildReport(i: ReportInput): ReportData {
  const { month, asOf } = i;
  const dim = daysInMonth(month);
  const pm = prevMonth(month);
  const lm = sameMonthLastYear(month);
  const closing = asOf >= monthEnd(month) || i.today.slice(0, 7) > month;
  const mode: ReportMode = closing ? "closing" : "weekly";
  const day = Math.min(Number(asOf.slice(8, 10)), dim);
  const weeks = weeksOfMonth(month).filter((w) => w.start <= asOf);
  const week = weeks[weeks.length - 1] ?? weeksOfMonth(month)[0];
  const cur = i.lines.filter((l) => l.date <= asOf);
  // comparisons: whole months for a closing, the same days 1–N while the month runs
  const cut = (ls: SalesLine[]) => (closing ? ls : ls.filter((l) => Number(l.date.slice(8, 10)) <= day));
  const prev = i.prev ? cut(i.prev.lines) : null;
  const ly = i.ly ? cut(i.ly) : null;
  const pDays = closing ? daysInMonth(pm) : Math.min(day, daysInMonth(pm));
  const monthName = mName(month);
  const year = month.slice(0, 4);
  const curLabel = closing ? monthName : day === 1 ? `1 ${monthName}` : `1–${day} ${monthName}`;
  const prevLabel = closing ? mName(pm) : pDays === 1 ? `1 ${mName(pm)}` : `1–${pDays} ${mName(pm)}`;

  const tCur = totals(cur);
  const tPrev = prev ? totals(prev) : null;
  const tLy = ly ? totals(ly) : null;
  const tgt = i.target;
  const tByGroup = tgt?.byGroup ?? zeroG();

  /* slide: target & achievement MTM – LFL */
  const row = (g: Group | "Amount"): GroupCompare => {
    const pick = (t: ReturnType<typeof totals> | null) => (t ? (g === "Amount" ? t.sales : t.byGroup[g]) : null);
    const target = g === "Amount" ? (tgt?.total ?? 0) : tByGroup[g];
    const mtd = pick(tCur)!;
    const mtm = pick(tPrev);
    const lfl = pick(tLy);
    return { group: g, target, mtd, achPct: ratio(mtd * 100, target), mtm, mtmGrowth: mtm == null ? null : growthPct(mtd, mtm), lfl, lflGrowth: lfl == null ? null : growthPct(mtd, lfl) };
  };
  const groups = [row("Amount"), ...GROUPS.map(row)];

  /* staff rows: target sheet order, then other staff with sales, then Online */
  const staffList: StaffLine[] = [];
  const seen = new Set<string>();
  for (const s of tgt?.staff ?? []) {
    const k = nameKey(s.name);
    if (!k || seen.has(k) || !(s.total > 0)) continue;
    seen.add(k);
    staffList.push({ key: k, name: s.name.trim(), kind: "staff" });
  }
  const extra = new Map<string, { name: string; sales: number }>();
  for (const l of cur) {
    if (l.isChannel) continue;
    const k = nameKey(l.staffName);
    if (!k || seen.has(k)) continue;
    const e = extra.get(k) ?? { name: displayName(l.staffName), sales: 0 };
    e.sales += l.amount;
    extra.set(k, e);
  }
  for (const [k, e] of [...extra.entries()].sort((a, b) => b[1].sales - a[1].sales)) staffList.push({ key: k, name: e.name, kind: "staff" });
  const ONLINE: StaffLine = { key: "__online", name: "Online*", kind: "online" };
  const keyOf = (l: SalesLine, known: Set<string>) => (l.isChannel ? "__online" : known.has(nameKey(l.staffName)) ? nameKey(l.staffName) : "__other");
  const known = new Set(staffList.map((s) => s.key));
  const byRow = (ls: SalesLine[]) => {
    const m = new Map<string, SalesLine[]>();
    for (const l of ls) {
      const k = keyOf(l, known);
      (m.get(k) ?? m.set(k, []).get(k)!).push(l);
    }
    return m;
  };
  const curBy = byRow(cur);
  const prevBy = prev ? byRow(prev) : new Map<string, SalesLine[]>();

  const androidSeen = new Map<string, string>();
  for (const b of Object.keys(tgt?.brands ?? {})) if (b.trim()) androidSeen.set(b.trim().toUpperCase(), b.trim());
  for (const l of cur) if (l.group === "Android") {
    const b = (l.lob || l.brand || "Lainnya").trim();
    if (!androidSeen.has(b.toUpperCase())) androidSeen.set(b.toUpperCase(), b);
  }
  const brandName = (l: SalesLine) => androidSeen.get((l.lob || l.brand || "Lainnya").trim().toUpperCase()) ?? (l.lob || l.brand || "Lainnya");

  const makeRow = (s: StaffLine): StaffRowData => {
    const ls = curBy.get(s.key) ?? [];
    const st = s.kind === "staff" ? tgt?.staff.find((x) => nameKey(x.name) === s.key) : undefined;
    const t = totals(ls);
    const target = zeroG();
    for (const g of GROUPS) target[g] = st?.byGroup[g] ?? 0;
    const android: Record<string, QV> = {};
    const apple: Record<string, QV> = {};
    const vas: Record<string, number> = {};
    let accEx = 0;
    let airpods = 0;
    for (const l of ls) {
      if (l.group === "Android") qvAdd((android[brandName(l)] ??= { qty: 0, value: 0 }), l);
      else if (l.group === "Apple") qvAdd((apple[l.lob || "Lainnya"] ??= { qty: 0, value: 0 }), l);
      else if (l.group === "ACC") {
        if (l.lob === "AirPods") airpods += l.amount;
        else accEx += l.amount;
      } else vas[l.vasProvider || "Lainnya"] = (vas[l.vasProvider || "Lainnya"] ?? 0) + l.amount;
    }
    const targetTotal = st?.total ?? 0;
    return { ...s, target, targetTotal, actual: t.byGroup, total: t.sales, achPct: ratio(t.sales * 100, targetTotal), invoices: t.invoices, qty: t.qty, atv: t.atv, upt: t.upt, android, apple, accEx, airpods, vas };
  };
  const staff = staffList.map(makeRow);
  if (curBy.has("__online")) staff.push(makeRow(ONLINE));
  if (curBy.has("__other")) staff.push(makeRow({ key: "__other", name: "Lainnya*", kind: "other" }));

  const rowInvoices = staff.reduce((a, s) => a + s.invoices, 0);

  /* android brands / apple LOB columns */
  const brandTotals = new Map<string, number>();
  for (const s of staff) for (const [b, v] of Object.entries(s.android)) brandTotals.set(b, (brandTotals.get(b) ?? 0) + v.value + v.qty);
  const targetBrands = Object.keys(tgt?.brands ?? {}).map((b) => androidSeen.get(b.trim().toUpperCase()) ?? b.trim());
  const androidBrands = [...targetBrands.filter((b) => brandTotals.has(b)), ...[...brandTotals.keys()].filter((b) => !targetBrands.includes(b)).sort((a, b) => (brandTotals.get(b) ?? 0) - (brandTotals.get(a) ?? 0))];
  const appleLobs = [...STAFF_APPLE_LOBS, ...new Set(staff.flatMap((s) => Object.keys(s.apple)).filter((k) => !(STAFF_APPLE_LOBS as readonly string[]).includes(k)))];

  /* ACC & VAS vs MTM: staff rows + "Lainnya" (online, ex-staff) */
  const accVasOf = (ls: SalesLine[]) => {
    const o = { accEx: 0, airpods: 0, qoala: 0, telkomsel: 0, xl: 0, indosat: 0, vasTotal: 0 };
    for (const l of ls) {
      if (l.group === "ACC") {
        if (l.lob === "AirPods") o.airpods += l.amount;
        else o.accEx += l.amount;
      } else if (l.group === "VAS") {
        o.vasTotal += l.amount;
        if (l.vasProvider === "Qoala") o.qoala += l.amount;
        else if (l.vasProvider === "Telkomsel") o.telkomsel += l.amount;
        else if (l.vasProvider === "XL") o.xl += l.amount;
        else if (l.vasProvider === "Indosat") o.indosat += l.amount;
      }
    }
    return o;
  };
  const accVas: AccVasRow[] = staffList.map((s) => {
    const c = accVasOf(curBy.get(s.key) ?? []);
    const p = accVasOf(prevBy.get(s.key) ?? []);
    return { name: s.name, ...c, accExPrev: p.accEx, airpodsPrev: p.airpods, qoalaPrev: p.qoala };
  });
  {
    const c = accVasOf([...(curBy.get("__online") ?? []), ...(curBy.get("__other") ?? [])]);
    const p = accVasOf([...(prevBy.get("__online") ?? []), ...(prevBy.get("__other") ?? [])]);
    if (Object.values(c).some(Boolean) || Object.values(p).some(Boolean)) accVas.push({ name: "Lainnya*", ...c, accExPrev: p.accEx, airpodsPrev: p.airpods, qoalaPrev: p.qoala });
  }

  /* productivity */
  const prodOf = (t: ReturnType<typeof totals>, ls: SalesLine[], traffic: TrafficEntry[], m: MonthKey, days: number): ProductivitySide => {
    const end = closing ? monthEnd(m) : `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, "0")}`;
    const cv = conversion(ls, traffic, monthStart(m), end);
    const qb = { ...zeroG(), ...t.qtyByGroup };
    return { amount: t.sales, dailyAvg: days ? t.sales / days : 0, balance: balanceOf(qb), invoices: t.invoices, traffic: cv.traffic || null, upt: t.upt, cvr: cv.cvr, atv: t.atv };
  };
  const productivity = {
    cur: prodOf(tCur, cur, i.traffic, month, day),
    prev: tPrev && prev ? prodOf(tPrev, prev, i.prev?.traffic ?? [], pm, pDays) : null,
  };

  /* weekly performance */
  const dailyTarget = (tgt?.total ?? 0) / dim;
  let last: number | null = null;
  const weekCols: WeekCol[] = weeks.map((w) => {
    const end = w.end < asOf ? w.end : asOf;
    const t = totals(cur.filter((l) => l.date >= w.start && l.date <= end));
    const target = dailyTarget * eachDay(w.start, w.end).length;
    const col: WeekCol = { label: `W${w.index}`, period: span(w.start, w.end, month), sales: t.sales, target, achPct: ratio(t.sales * 100, target), trx: t.invoices, upt: t.upt, atv: t.atv, vsPrev: last == null ? null : growthPct(t.sales, last) };
    last = t.sales;
    return col;
  });
  const weeksTotal = {
    sales: tCur.sales,
    target: tgt?.total ?? 0,
    achPct: ratio(tCur.sales * 100, tgt?.total ?? 0),
    trx: tCur.invoices,
    upt: tCur.upt,
    atv: tCur.atv,
    mtmGrowth: tPrev ? growthPct(tCur.sales, tPrev.sales) : null,
    period: span(monthStart(month), asOf, month),
  };

  /* BNPL (menu BNPL) */
  const bn = new Map<string, QV>();
  for (const r of i.bnpl) {
    if (!r.key) continue;
    const e = bn.get(r.key) ?? { qty: 0, value: 0 };
    e.qty += Number(r.data.qty) || 0;
    e.value += Number(r.data.amount) || 0;
    bn.set(r.key, e);
  }
  const providers = [...BNPL_PROVIDERS, ...[...bn.keys()].filter((k) => !(BNPL_PROVIDERS as readonly string[]).includes(k) && !/laku6|onepulse/i.test(k))];
  const bnplRows = providers.map((p) => ({ provider: p, label: BNPL_LABEL[p] ?? p, value: bn.get(p)?.value ?? 0, qty: bn.get(p)?.qty ?? 0 }));
  const bnpl = { rows: bnplRows, value: bnplRows.reduce((a, r) => a + r.value, 0), qty: bnplRows.reduce((a, r) => a + r.qty, 0) };

  /* YTD: Jan..month, both years; the running month (or a file ending mid-month) is cut on both sides */
  const prevYear = String(Number(year) - 1);
  const ytd: YtdRow[] = [];
  for (let n = 1; n <= Number(month.slice(5, 7)); n++) {
    const mm = String(n).padStart(2, "0");
    const c = i.ytd.get(`${year}-${mm}`);
    const p = i.ytd.get(`${prevYear}-${mm}`);
    if (!c && !p) continue;
    const lastOf = (ls: SalesLine[]) => ls.reduce((d, l) => Math.max(d, Number(l.date.slice(8, 10)) || 0), 0);
    const full = (ls: SalesLine[], m: string) => lastOf(ls) >= daysInMonth(m);
    let upTo: number | null = null;
    if (c && p && (!full(c, `${year}-${mm}`) || !full(p, `${prevYear}-${mm}`))) upTo = Math.min(lastOf(c), lastOf(p));
    const sum = (ls: SalesLine[] | undefined) => {
      if (!ls) return null;
      const t = totals(upTo ? ls.filter((l) => Number(l.date.slice(8, 10)) <= upTo!) : ls);
      return { qty: t.qty, value: t.sales };
    };
    // the running month itself is cut to asOf already
    const cc = `${year}-${mm}` === month ? cur : c;
    ytd.push({ label: MONTHS_SHORT[n - 1], prev: sum(p), cur: sum(cc), upTo });
  }

  /* LOB per brand vs MTM */
  const bC = lobBreakdown(cur);
  const bP = lobBreakdown(prev ?? []);
  const z = (): QV => ({ qty: 0, value: 0 });
  const lob: LobRow[] = [];
  const appleKeys = ["iPhone", "iPad", "Mac", "Apple Watch", "AirPods", ...new Set([...Object.keys(bC.apple), ...Object.keys(bP.apple)].filter((k) => !["iPhone", "iPad", "Mac", "Apple Watch", "AirPods"].includes(k)))];
  for (const k of appleKeys) lob.push({ label: LOB_LABEL[k] ?? k, kind: "apple", cur: bC.apple[k] ?? z(), prev: bP.apple[k] ?? z() });
  const sumQ = (r: LobRow[], side: "cur" | "prev") => r.reduce((a, x) => ({ qty: a.qty + x[side].qty, value: a.value + x[side].value }), z());
  const ap = lob.slice();
  lob.push({ label: "Total Apple", kind: "totalApple", cur: sumQ(ap, "cur"), prev: sumQ(ap, "prev") });
  const andKeys = new Map<string, string>();
  for (const k of [...Object.keys(bC.android), ...Object.keys(bP.android)]) if (!andKeys.has(k.toUpperCase())) andKeys.set(k.toUpperCase(), androidSeen.get(k.toUpperCase()) ?? k);
  const qvOf = (o: Record<string, QV>, label: string) => Object.entries(o).filter(([k]) => k.toUpperCase() === label.toUpperCase()).reduce((a, [, v]) => ({ qty: a.qty + v.qty, value: a.value + v.value }), z());
  const andRows: LobRow[] = [...andKeys.values()].map((b) => ({ label: b, kind: "android" as const, cur: qvOf(bC.android, b), prev: qvOf(bP.android, b) }));
  const order = (b: string) => {
    const t = targetBrands.indexOf(b);
    return t < 0 ? 999 : t;
  };
  andRows.sort((a, b) => order(a.label) - order(b.label) || b.cur.value - a.cur.value);
  lob.push(...andRows, { label: "Total Android", kind: "totalAndroid", cur: sumQ(andRows, "cur"), prev: sumQ(andRows, "prev") });

  const data: ReportData = {
    storeCode: i.storeCode,
    storeName: i.storeName,
    month,
    mode,
    asOf,
    day,
    daysInMonth: dim,
    weekIndex: week.index,
    timeGonePct: closing ? 100 : (day / dim) * 100,
    title: closing ? `Closing ${monthName} ${year}` : `Weekly Report W${week.index} ${monthName} ${year}`,
    curLabel,
    prevLabel,
    prevShort: closing ? mShort(pm) : span(monthStart(pm), `${pm}-${String(pDays).padStart(2, "0")}`, pm),
    lyShort: `${mShort(lm)} ${lm.slice(2, 4)}`,
    monthName,
    year,
    hasPrev: !!prev,
    hasLy: !!ly,
    groups,
    staff,
    storeTotals: { invoices: tCur.invoices, atv: tCur.atv, upt: tCur.upt, rowInvoices, total: tCur.sales, target: tgt?.total ?? 0, targetByGroup: tByGroup, actual: tCur.byGroup },
    balance: { value: balanceOf(tCur.byGroup), qty: balanceOf({ ...zeroG(), ...tCur.qtyByGroup }) },
    androidBrands,
    appleLobs,
    accVas,
    productivity,
    weeks: weekCols,
    weeksTotal,
    bnpl,
    ytd,
    ytdYears: [prevYear, year],
    lob,
    issues: [],
  };
  data.issues = autoIssues(data);
  return data;
}

/** Three "Issue" cells written from the numbers (the feedback column is typed by the user). */
export function autoIssues(d: ReportData): string[] {
  const g = Object.fromEntries(d.groups.map((x) => [x.group, x])) as Record<string, GroupCompare>;
  const a = g.Amount;
  const out: string[] = [];
  const word = closing(d) ? `Achievement ${d.monthName}` : `Achievement MTD ${d.curLabel}`;
  const vs: string[] = [];
  if (a.mtmGrowth != null) vs.push(`${a.mtmGrowth >= 0 ? "naik" : "turun"} ${Math.abs(Math.round(a.mtmGrowth))}% MTM`);
  if (a.lflGrowth != null) vs.push(`${a.lflGrowth >= 0 ? "naik" : "turun"} ${Math.abs(Math.round(a.lflGrowth))}% LFL`);
  const l1 = [`${word} ${rpShort(a.mtd)} = ${pc0(a.achPct)} dari target (${rpShort(a.target)})${vs.length ? `, ${vs.join(" & ")}` : ""}`];
  const ip = d.lob.find((x) => x.label === "iPhone");
  if (g.Apple) l1.push(`Apple ${pc0(g.Apple.achPct)} (${rpShort(g.Apple.mtd)})${ip && d.hasPrev ? `: iPhone ${ip.cur.qty} unit (${ip.cur.qty - ip.prev.qty >= 0 ? "+" : ""}${ip.cur.qty - ip.prev.qty} unit / ${signed(growthPct(ip.cur.value, ip.prev.value))} value MTM)` : ""}`);
  const online = d.staff.find((s) => s.kind === "online");
  const top = d.staff.filter((s) => s.kind === "staff").sort((x, y) => y.total - x.total)[0];
  const share = (n: number) => pc0(ratio(n * 100, d.storeTotals.total));
  const parts: string[] = [];
  if (online && online.total) parts.push(`Online channel kontribusi ${share(online.total)} (${rpShort(online.total)})`);
  if (top && top.total) parts.push(`${top.name} ${share(top.total)} (${rpShort(top.total)})`);
  if (parts.length) l1.push(parts.join(", "));
  out.push(l1.join("\n"));

  const ta = d.lob.find((x) => x.kind === "totalAndroid");
  const l2: string[] = [];
  if (ta && d.hasPrev) {
    const dq = ta.cur.qty - ta.prev.qty;
    const dv = ta.cur.value - ta.prev.value;
    l2.push(`Android ${dq >= 0 ? "naik" : "turun"} ${Math.abs(dq)} unit (${signed(growthPct(ta.cur.qty, ta.prev.qty))}) / ${dv >= 0 ? "+" : "-"}${rpShort(Math.abs(dv)).replace("Rp", "")} (${signed(growthPct(ta.cur.value, ta.prev.value))}) MTM, achievement ${pc0(g.Android.achPct)}`);
  } else l2.push(`Android achievement ${pc0(g.Android.achPct)} (${rpShort(g.Android.mtd)})`);
  if (d.hasPrev) {
    const acc = d.accVas.reduce((x, r) => ({ c: x.c + r.accEx, p: x.p + r.accExPrev }), { c: 0, p: 0 });
    l2.push(`ACC exc Airpods ${signed(growthPct(acc.c, acc.p))} & VAS ${signed(g.VAS.mtmGrowth)} MTM, achievement ACC ${pc0(g.ACC.achPct)} & VAS ${pc0(g.VAS.achPct)}`);
  } else l2.push(`Achievement ACC ${pc0(g.ACC.achPct)} & VAS ${pc0(g.VAS.achPct)}`);
  out.push(l2.join("\n"));

  const c = d.productivity.cur;
  const p = d.productivity.prev;
  const jt = (n: number | null) => (n == null ? "–" : `Rp${(n / 1e6).toFixed(1).replace(".", ",")} jt`);
  const u = (n: number | null) => (n == null ? "–" : n.toFixed(1));
  if (p) {
    const ud = (c.upt ?? 0) - (p.upt ?? 0);
    out.push(`Produktivitas: invoice ${signed(growthPct(c.invoices, p.invoices))} (${p.invoices} ke ${c.invoices}), ATV ${signed(growthPct(c.atv ?? 0, p.atv ?? 0))} (${jt(p.atv)} ke ${jt(c.atv)}), UPT ${Math.abs(ud) < 0.05 ? "tetap" : ud > 0 ? "naik" : "turun"} ${u(p.upt)} ke ${u(c.upt)}`);
  } else out.push(`Produktivitas: invoice ${c.invoices}, ATV ${jt(c.atv)}, UPT ${u(c.upt)}`);
  return out;
}

const closing = (d: ReportData) => d.mode === "closing";
