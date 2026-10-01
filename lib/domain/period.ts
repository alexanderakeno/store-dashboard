import type { ISODate, MonthKey } from "@/types/domain";

/** Period helpers. All dates are plain `YYYY-MM-DD` strings in store time. */

const pad = (n: number) => String(n).padStart(2, "0");

export function toUTC(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUTC(dt: Date): ISODate {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(date: ISODate, n: number): ISODate {
  const dt = toUTC(date);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
}

export function monthOf(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthStart(month: MonthKey): ISODate {
  return `${month}-01`;
}

export function monthEnd(month: MonthKey): ISODate {
  return `${month}-${pad(daysInMonth(month))}`;
}

export function prevMonth(month: MonthKey): MonthKey {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

export function sameMonthLastYear(month: MonthKey): MonthKey {
  const [y, m] = month.split("-").map(Number);
  return `${y - 1}-${pad(m)}`;
}

/** Today in a given IANA timezone as ISO date. */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function dayOfWeek(date: ISODate): number {
  return toUTC(date).getUTCDay(); // 0 = Sunday
}

export interface WeekRange {
  index: number; // 1-based within the month
  label: string; // "Week 1"
  start: ISODate;
  end: ISODate;
}

/** Sunday–Saturday weeks of a month, clipped to the month boundaries. */
export function weeksOfMonth(month: MonthKey): WeekRange[] {
  const first = monthStart(month);
  const last = monthEnd(month);
  const weeks: WeekRange[] = [];
  let start = first;
  let index = 1;
  while (start <= last) {
    const toSat = 6 - dayOfWeek(start);
    let end = addDays(start, toSat);
    if (end > last) end = last;
    weeks.push({ index, label: `Week ${index}`, start, end });
    start = addDays(end, 1);
    index++;
  }
  return weeks;
}

export function weekOf(date: ISODate): WeekRange {
  const w = weeksOfMonth(monthOf(date)).find((x) => date >= x.start && date <= x.end);
  if (!w) throw new Error(`No week for ${date}`);
  return w;
}

export function inRange(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}
