/**
 * Extra view-models for the M238-style pages. Pure functions over the same
 * enriched lines used everywhere else (lib/domain/views.ts), so numbers match.
 */
import { GROUPS, type Group, type ISODate, type MonthKey, type SalesLine, type StoreTarget, type Totals } from "@/types/domain";
import { byStaff, totals, type StaffRow } from "./kpi";
import { displayName, nameKey } from "./normalize";
import { daysInMonth, eachDay, monthStart, weeksOfMonth, type WeekRange } from "./period";
import { conversion, type HomeView, type MonthInput } from "./views";

export const APPLE_LOBS = ["iPhone", "Mac", "iPad", "Apple Watch", "AirPods"] as const;
export const VAS_PROVIDERS = ["Qoala", "Telkomsel", "XL", "Indosat"] as const;

const ratio = (a: number, b: number) => (b ? a / b : null);

/** Time gone % = data date ÷ days in month × 100. */
export function timeGonePct(month: MonthKey, asOf: ISODate): number {
  if (asOf.slice(0, 7) < month) return 0;
  if (asOf.slice(0, 7) > month) return 100;
  return (Number(asOf.slice(8, 10)) / daysInMonth(month)) * 100;
}

export const deviceOf = (byGroup: Record<Group, number>) => byGroup.Apple + byGroup.Android;

export interface PerfCard {
  key: "total" | "device" | "acc" | "vas";
  label: string;
  actual: number;
  target: number;
  achievementPct: number | null;
  estimate: number;
  points: number;
  pointsMax: number;
  /** Target − actual (what is still missing; ≤ 0 = target reached). */
  variance: number;
}

/** Store Performance cards: Total · Device (Apple + Android) · Accessories · VAS. */
export function perfCards(h: HomeView): PerfCard[] {
  const g = Object.fromEntries(h.groups.map((x) => [x.group, x])) as Record<Group, HomeView["groups"][number]>;
  const card = (key: PerfCard["key"], label: string, groups: Group[]): PerfCard => {
    const actual = groups.reduce((a, k) => a + g[k].actual, 0);
    const target = groups.reduce((a, k) => a + g[k].target, 0);
    return {
      key,
      label,
      actual,
      target,
      achievementPct: ratio(actual * 100, target),
      estimate: groups.reduce((a, k) => a + g[k].estimate, 0),
      points: groups.reduce((a, k) => a + g[k].point, 0),
      pointsMax: groups.reduce((a, k) => a + g[k].pointCap, 0),
      variance: actual - target, // Gap = Actual − Target (DECISIONS.md)
    };
  };
  return [card("total", "Total Sales", [...GROUPS]), card("device", "Device", ["Apple", "Android"]), card("acc", "Accessories", ["ACC"]), card("vas", "VAS", ["VAS"])];
}

export type StaffStatus = "Productive" | "Need Push";

export interface StaffStat {
  key: string;
  name: string;
  nik: string | null;
  isChannel: boolean;
  totals: Totals;
  device: number;
  acc: number;
  vas: number;
  target: number;
  achievementPct: number | null;
  /** Target − actual. */
  gap: number;
  status: StaffStatus;
  /** Achievement ≥ time gone. */
  onPace: boolean;
}

/** Staff list with device/acc/vas split and a productivity status vs time gone. */
export function staffStats(lines: SalesLine[], target: StoreTarget | null, timeGone: number, opts: { includeChannels?: boolean; targetScale?: number } = {}): StaffStat[] {
  const { staff, channels } = byStaff(lines, target, opts.targetScale ?? 1);
  const rows: StaffRow[] = opts.includeChannels ? [...staff, ...channels] : staff;
  return rows
    .map((s) => {
      const ach = s.achievement.achievementPct;
      const onPace = ach == null ? true : ach >= timeGone;
      return {
        key: s.key,
        name: displayName(s.name),
        nik: s.nik,
        isChannel: s.isChannel,
        totals: s.totals,
        device: deviceOf(s.totals.byGroup),
        acc: s.totals.byGroup.ACC,
        vas: s.totals.byGroup.VAS,
        target: s.target,
        achievementPct: ach,
        gap: s.target - s.totals.sales,
        onPace,
        status: (s.target > 0 && !onPace ? "Need Push" : "Productive") as StaffStatus,
      };
    })
    .sort((a, b) => b.totals.sales - a.totals.sales);
}

/** Qty per Apple LOB (iPhone, Mac, iPad, Apple Watch, AirPods). */
export function lobQty(lines: SalesLine[]): Record<(typeof APPLE_LOBS)[number], number> {
  const out = { iPhone: 0, Mac: 0, iPad: 0, "Apple Watch": 0, AirPods: 0 };
  for (const l of lines) if (l.lob && l.lob in out && l.countsInQty) out[l.lob as keyof typeof out] += l.qty;
  return out;
}

export function lobValue(lines: SalesLine[]): Record<(typeof APPLE_LOBS)[number], number> {
  const out = { iPhone: 0, Mac: 0, iPad: 0, "Apple Watch": 0, AirPods: 0 };
  for (const l of lines) if (l.lob && l.lob in out) out[l.lob as keyof typeof out] += l.amount;
  return out;
}

export function vasSplit(lines: SalesLine[]): Record<(typeof VAS_PROVIDERS)[number], { qty: number; value: number }> {
  const out = Object.fromEntries(VAS_PROVIDERS.map((p) => [p, { qty: 0, value: 0 }])) as Record<(typeof VAS_PROVIDERS)[number], { qty: number; value: number }>;
  for (const l of lines) {
    const p = l.vasProvider as keyof typeof out | null;
    if (p && p in out) {
      out[p].qty += l.qty;
      out[p].value += l.amount;
    }
  }
  return out;
}

/** Group lines by staff key (same key as byStaff). */
export function linesByStaff(lines: SalesLine[]): Map<string, SalesLine[]> {
  const m = new Map<string, SalesLine[]>();
  for (const l of lines) {
    const k = l.nik ?? `name:${nameKey(l.staffName)}`;
    const list = m.get(k) ?? [];
    list.push(l);
    m.set(k, list);
  }
  return m;
}

export interface DayRow {
  date: ISODate;
  totals: Totals;
  device: number;
  acc: number;
  vas: number;
  cvr: number | null;
  traffic: number | null;
  lob: ReturnType<typeof lobQty>;
  vasValue: Record<(typeof VAS_PROVIDERS)[number], number>;
}

export function dayRows(m: MonthInput, from: ISODate, to: ISODate): DayRow[] {
  const byDate = new Map<ISODate, SalesLine[]>();
  for (const l of m.lines) {
    if (l.date < from || l.date > to) continue;
    const list = byDate.get(l.date) ?? [];
    list.push(l);
    byDate.set(l.date, list);
  }
  const trafficOf = new Map(m.traffic.map((t) => [t.date, t.traffic]));
  return eachDay(from, to)
    .filter((d) => byDate.has(d))
    .map((date) => {
      const ls = byDate.get(date)!;
      const t = totals(ls);
      const traffic = trafficOf.get(date) ?? null;
      const vs = vasSplit(ls);
      return {
        date,
        totals: t,
        device: deviceOf(t.byGroup),
        acc: t.byGroup.ACC,
        vas: t.byGroup.VAS,
        traffic,
        cvr: traffic ? (t.invoices / traffic) * 100 : null,
        lob: lobQty(ls),
        vasValue: { Qoala: vs.Qoala.value, Telkomsel: vs.Telkomsel.value, XL: vs.XL.value, Indosat: vs.Indosat.value },
      };
    });
}

export function rangeConversion(m: MonthInput, from: ISODate, to: ISODate) {
  return conversion(m.lines.filter((l) => l.date >= from && l.date <= to), m.traffic, from, to);
}

/**
 * Product "type" (model family) from the description, e.g.
 * "IPHONE 17 PRO MAX 256GB DEEP BLUE" → "iPhone 17 Pro Max".
 */
export function productType(l: Pick<SalesLine, "description" | "lob" | "article">): string {
  const d = (l.description || l.article).toUpperCase();
  const cut = d.split(/\s(?:\d+\s?(?:GB|TB)|WI-?FI|WIFI|CELL|CELLULAR|GPS|\d{2}MM|\(|M\d\s?\d+C|\d+-CORE)/)[0];
  const words = cut.split(/\s+/).slice(0, 5).join(" ");
  const nice = words
    .toLowerCase()
    .replace(/\b([a-z])([a-z]*)/g, (_m, x: string, y: string) => x.toUpperCase() + y)
    .replace(/\bIphone\b/g, "iPhone")
    .replace(/\bIpad\b/g, "iPad")
    .replace(/\bImac\b/g, "iMac")
    .replace(/\bMacbook\b/g, "MacBook")
    .replace(/\bAirpods\b/g, "AirPods")
    .replace(/\bSe\b/g, "SE")
    .replace(/\b(M\d)\b/gi, (x) => x.toUpperCase());
  return nice.trim() || (l.lob ?? "Lainnya");
}

/** Qty per product type for Apple devices (+ AirPods). */
export function typeQty(lines: SalesLine[]): Array<{ type: string; lob: string; qty: number; value: number }> {
  const map = new Map<string, { type: string; lob: string; qty: number; value: number }>();
  for (const l of lines) {
    if (!l.lob || !(APPLE_LOBS as readonly string[]).includes(l.lob) || !l.countsInQty) continue;
    const type = productType(l);
    const e = map.get(type) ?? { type, lob: l.lob, qty: 0, value: 0 };
    e.qty += l.qty;
    e.value += l.amount;
    map.set(type, e);
  }
  const order = (lob: string) => APPLE_LOBS.indexOf(lob as (typeof APPLE_LOBS)[number]);
  return [...map.values()].sort((a, b) => order(a.lob) - order(b.lob) || b.qty - a.qty);
}

/** Weeks of the month that have started by asOf. */
export function startedWeeks(month: MonthKey, asOf: ISODate): WeekRange[] {
  return weeksOfMonth(month).filter((w) => w.start <= asOf);
}

export function clampRange(month: MonthKey, asOf: ISODate, from?: string, to?: string): { from: ISODate; to: ISODate } {
  const start = monthStart(month);
  const valid = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d.startsWith(month);
  let f = valid(from) ? from! : start;
  let t = valid(to) ? to! : asOf;
  if (t > asOf) t = asOf;
  if (f > t) [f, t] = [t, f];
  return { from: f, to: t };
}

export function linesIn(m: MonthInput, from: ISODate, to: ISODate): SalesLine[] {
  return m.lines.filter((l) => l.date >= from && l.date <= to);
}

/** Android qty / value per brand (Samsung, Oppo, …), best-selling first; `extra` brands (e.g. the target sheet's columns) show with 0. */
export function androidBrands(lines: SalesLine[], extra: string[] = []): Array<{ brand: string; qty: number; value: number }> {
  const m = new Map<string, { brand: string; qty: number; value: number }>();
  const get = (b: string) => {
    const k = b.trim().toUpperCase();
    let e = m.get(k);
    if (!e) m.set(k, (e = { brand: b.trim(), qty: 0, value: 0 }));
    return e;
  };
  for (const l of lines) {
    if (l.group !== "Android" || !l.lob) continue;
    const e = get(l.lob);
    if (l.countsInQty) e.qty += l.qty;
    e.value += l.amount;
  }
  for (const b of extra) if (b.trim()) get(b);
  return [...m.values()].sort((a, b) => b.value - a.value || b.qty - a.qty || a.brand.localeCompare(b.brand));
}

/** Qty + value of one row of the LOB comparison. */
export interface QV {
  qty: number;
  value: number;
}
export interface LobBreakdown {
  /** iPhone · iPad · Mac · Apple Watch · AirPods (AirPods sit under Apple here, not under ACC); other Apple LOBs after. */
  apple: Record<string, QV>;
  /** Per brand (Samsung, Oppo, …). */
  android: Record<string, QV>;
  /** ACC without AirPods. */
  acc: QV;
  vas: QV;
}

/**
 * Week-to-week "Weekly Dashboard" split: Apple per LOB (incl. AirPods), Android per brand, ACC (excl. AirPods), VAS.
 * Apple + Android + ACC + VAS = total sales. Device / AirPods / ACC qty follow the qty rules (qty types); VAS counts every unit.
 */
export function lobBreakdown(lines: SalesLine[]): LobBreakdown {
  const z = (): QV => ({ qty: 0, value: 0 });
  const out: LobBreakdown = { apple: { iPhone: z(), iPad: z(), Mac: z(), "Apple Watch": z(), AirPods: z() }, android: {}, acc: z(), vas: z() };
  for (const l of lines) {
    let t: QV;
    let unit = l.countsInQty;
    if (l.lob === "AirPods" || l.group === "Apple") t = out.apple[l.lob || "Apple lainnya"] ??= z();
    else if (l.group === "Android") t = out.android[l.lob || l.brand || "Lainnya"] ??= z();
    else if (l.group === "ACC") t = out.acc;
    else {
      // VAS lines are not "qty types", but each policy / package counts as one
      t = out.vas;
      unit = true;
    }
    t.value += l.amount;
    if (unit) t.qty += l.qty;
  }
  return out;
}
