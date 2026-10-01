import "server-only";
import { requireSession, type Session } from "@/lib/auth/session";
import { getMonths, getMonthSnapshot, resolveAsOf, resolveMonth, type MonthSnapshot } from "@/lib/services/dashboard";
import type { MonthEntry } from "@/lib/repositories";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export type PageData =
  | { state: "ok"; session: Session; months: MonthEntry[]; month: string; snap: MonthSnapshot; asOf: string; q: Record<string, string> }
  | { state: "no-month"; session: Session; months: MonthEntry[] }
  | { state: "error"; session: Session; months: MonthEntry[]; month: string; error: string };

/** Common loader for every data page: session → month → snapshot → as-of date. */
export async function loadPage(searchParams: SearchParams): Promise<PageData> {
  const session = await requireSession();
  const raw = await searchParams;
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") q[k] = v;
  let months: MonthEntry[] = [];
  try {
    months = (await getMonths()).filter((m) => m.active);
  } catch (e) {
    return { state: "error", session, months, month: "", error: `Master sheet tidak bisa dibaca: ${(e as Error).message}` };
  }
  const month = await resolveMonth(q.m);
  if (!month) return { state: "no-month", session, months };
  try {
    const snap = await getMonthSnapshot(month);
    return { state: "ok", session, months, month, snap, asOf: resolveAsOf(snap, q.d), q };
  } catch (e) {
    return { state: "error", session, months, month, error: (e as Error).message };
  }
}
