/**
 * Qoala focus page: device units (watches excluded) vs Qoala policies, attach rate (AR), split by
 * Apple / Android device, per staff and per day, compared with the same days of last month.
 * Pure — the same enriched lines as every page.
 */
import type { ISODate, SalesLine } from "@/types/domain";
import { displayName, nameKey } from "./normalize";
import { isOnlineName } from "./report";

/** Watches / bands are not insured by Qoala, so they don't count as AR opportunities. */
export function isWatch(l: Pick<SalesLine, "lob" | "category" | "description" | "brand">): boolean {
  if (l.lob === "Apple Watch") return true;
  if (/AMAZFIT/i.test(l.lob ?? "") || /AMAZFIT/i.test(l.brand)) return true;
  return /\b(SMART ?)?WATCH\b|\bBAND\b|WEARABLE/i.test(`${l.category} ${l.description}`);
}

/** Device unit that is a Qoala opportunity (phone, tablet, laptop — not a watch). */
export const isQoalaDevice = (l: SalesLine) => l.type === "DEVICES" && l.countsInQty && (l.group === "Apple" || l.group === "Android") && !isWatch(l);
export const isQoala = (l: SalesLine) => l.vasProvider === "Qoala";

export interface QStats {
  devApple: number;
  devAndroid: number;
  dev: number;
  /** Qoala policies attached (by invoice) to an Apple / Android device, or sold on an invoice without a device. */
  qApple: number;
  qAndroid: number;
  qOther: number;
  q: number;
  value: number;
  ar: number | null;
  arApple: number | null;
  arAndroid: number | null;
  /** Device units on invoices without any Qoala. */
  missed: number;
}

const ratio = (a: number, b: number) => (b ? (a / b) * 100 : null);

function finish(s: Omit<QStats, "dev" | "q" | "ar" | "arApple" | "arAndroid">): QStats {
  const dev = s.devApple + s.devAndroid;
  const q = s.qApple + s.qAndroid + s.qOther;
  return { ...s, dev, q, ar: ratio(q, dev), arApple: ratio(s.qApple, s.devApple), arAndroid: ratio(s.qAndroid, s.devAndroid) };
}

const empty = () => ({ devApple: 0, devAndroid: 0, qApple: 0, qAndroid: 0, qOther: 0, value: 0, missed: 0 });

/** Which device an invoice carries (Apple wins when both) and whether it has Qoala. */
function invoiceIndex(lines: SalesLine[]) {
  const m = new Map<string, { apple: boolean; android: boolean; qoala: boolean }>();
  for (const l of lines) {
    if (!l.invoice) continue;
    const e = m.get(l.invoice) ?? { apple: false, android: false, qoala: false };
    if (isQoalaDevice(l)) {
      if (l.group === "Apple") e.apple = true;
      else e.android = true;
    }
    if (isQoala(l)) e.qoala = true;
    m.set(l.invoice, e);
  }
  return m;
}

/** Stats of a set of lines (invoice links are looked up in `index`, built from all lines of the period). */
export function qoalaStats(lines: SalesLine[], index = invoiceIndex(lines)): QStats {
  const s = empty();
  for (const l of lines) {
    if (isQoalaDevice(l)) {
      if (l.group === "Apple") s.devApple += l.qty;
      else s.devAndroid += l.qty;
      if (!l.invoice || !index.get(l.invoice)?.qoala) s.missed += l.qty;
    } else if (isQoala(l)) {
      const inv = l.invoice ? index.get(l.invoice) : undefined;
      if (inv?.apple) s.qApple += l.qty;
      else if (inv?.android) s.qAndroid += l.qty;
      else s.qOther += l.qty;
      s.value += l.amount;
    }
  }
  return finish(s);
}

export interface QStaffRow {
  key: string;
  name: string;
  online: boolean;
  cur: QStats;
  prev: QStats | null;
  /** Value growth vs the same days last month (%). */
  growth: number | null;
  days: Array<{ date: ISODate; s: QStats }>;
}

export interface QDayRow {
  date: ISODate;
  s: QStats;
  /** Same day number last month (null when that month has no such day / no data). */
  prev: QStats | null;
  staff: Array<{ name: string; s: QStats }>;
}

export interface MissedItem {
  date: ISODate;
  staff: string;
  description: string;
  group: "Apple" | "Android";
  amount: number;
}

export interface QoalaView {
  cur: QStats;
  prev: QStats | null;
  staff: QStaffRow[];
  days: QDayRow[];
  missed: MissedItem[];
  /** Average premium per policy. */
  avgPolicy: number | null;
  prevAvgPolicy: number | null;
}

const relevant = (l: SalesLine) => isQoalaDevice(l) || isQoala(l);

/**
 * `cur` = this month up to `asOf`; `prev` = last month's lines (cut here to the same day number).
 * Staff are ranked by Qoala value, then AR.
 */
export function qoalaView(curAll: SalesLine[], asOf: ISODate, prevAll: SalesLine[] | null, channelNames: string[] = []): QoalaView {
  // online sales (Digiplus.co.id, Mapemall, …) are one "Online" row even when they carry a NIK
  const isOnline = (l: SalesLine) => l.isChannel || isOnlineName(l.staffName, channelNames);
  const staffKey = (l: SalesLine) => (isOnline(l) ? "__online" : nameKey(l.staffName) || "__none");
  const day = Number(asOf.slice(8, 10));
  const cur = curAll.filter((l) => l.date <= asOf);
  const prev = prevAll ? prevAll.filter((l) => Number(l.date.slice(8, 10)) <= day) : null;
  const ci = invoiceIndex(cur);
  const pi = prev ? invoiceIndex(prev) : null;

  const group = <K,>(ls: SalesLine[], key: (l: SalesLine) => K) => {
    const m = new Map<K, SalesLine[]>();
    for (const l of ls) {
      if (!relevant(l)) continue;
      const k = key(l);
      (m.get(k) ?? m.set(k, []).get(k)!).push(l);
    }
    return m;
  };

  const curBy = group(cur, staffKey);
  const prevBy = prev ? group(prev, staffKey) : new Map<string, SalesLine[]>();
  const names = new Map<string, string>();
  for (const l of cur) if (relevant(l)) names.set(staffKey(l), isOnline(l) ? "Online" : displayName(l.staffName) || "(tanpa nama)");

  const staff: QStaffRow[] = [...curBy.entries()].map(([key, ls]) => {
    const c = qoalaStats(ls, ci);
    const p = prev ? qoalaStats(prevBy.get(key) ?? [], pi!) : null;
    const byDay = group(ls, (l) => l.date);
    return {
      key,
      name: names.get(key) ?? key,
      online: key === "__online",
      cur: c,
      prev: p,
      growth: p && p.value ? (c.value / p.value - 1) * 100 : null,
      days: [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, dl]) => ({ date, s: qoalaStats(dl, ci) })),
    };
  });
  staff.sort((a, b) => Number(a.online) - Number(b.online) || b.cur.value - a.cur.value || (b.cur.ar ?? -1) - (a.cur.ar ?? -1) || a.name.localeCompare(b.name));

  const curDays = group(cur, (l) => l.date);
  const prevDays = prev ? group(prev, (l) => Number(l.date.slice(8, 10))) : new Map<number, SalesLine[]>();
  const days: QDayRow[] = [...curDays.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, ls]) => {
      const pd = prevDays.get(Number(date.slice(8, 10)));
      const per = group(ls, staffKey);
      return {
        date,
        s: qoalaStats(ls, ci),
        prev: prev && pd ? qoalaStats(pd, pi!) : prev ? qoalaStats([], pi!) : null,
        staff: [...per.entries()].map(([k, sl]) => ({ name: names.get(k) ?? k, s: qoalaStats(sl, ci) })).sort((a, b) => b.s.value - a.s.value || b.s.dev - a.s.dev),
      };
    });

  const missed: MissedItem[] = cur
    .filter((l) => isQoalaDevice(l) && l.qty > 0 && !(l.invoice && ci.get(l.invoice)?.qoala))
    .map((l) => ({ date: l.date, staff: isOnline(l) ? "Online" : displayName(l.staffName), description: l.description || l.article, group: l.group as "Apple" | "Android", amount: l.amount }))
    .sort((a, b) => b.amount - a.amount);

  const c = qoalaStats(cur, ci);
  const p = prev ? qoalaStats(prev, pi!) : null;
  return { cur: c, prev: p, staff, days, missed, avgPolicy: c.q ? c.value / c.q : null, prevAvgPolicy: p?.q ? p.value / p.q : null };
}
