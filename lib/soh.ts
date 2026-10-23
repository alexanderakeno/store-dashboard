import "server-only";
import { cached, shared } from "@/lib/cache";
import { dataSource } from "@/lib/repositories";
import { addDays, monthStart, prevMonth } from "@/lib/domain/period";
import { emptyStock, type EmptyGroup } from "@/lib/domain/stockKosong";
import { getMonthLines, resolveAsOf, type MonthSnapshot } from "@/lib/services/dashboard";
import type { ISODate } from "@/types/domain";
import type { SohSnapshot } from "@/types/soh";

/** SOH changes only on import (which expires the "soh" tag), so a minute of caching is safe. */
const SOH_TTL_SEC = 60;

/**
 * Cached read of the latest SOH import (memory + cross-instance cache).
 * Returns null only when nothing was ever imported; a failed read THROWS —
 * callers must not show a read error as "no data".
 */
export async function getSoh(): Promise<SohSnapshot | null> {
  const { value } = await cached("soh:latest", SOH_TTL_SEC * 1000, () => shared(["soh", "latest"], ["soh"], SOH_TTL_SEC, () => dataSource().getSoh()));
  return value;
}

/** Days of sales looked at for "Stock Kosong". */
export const KOSONG_DAYS = 30;

/**
 * "Stock Kosong" for a month page: devices sold in the last 30 days up to the latest sales date
 * (reaching into last month early in the month) that are empty in the given SOH.
 * `partial` = last month's sales were not available, so the window starts on the 1st.
 */
export async function stockKosong(soh: SohSnapshot, snap: MonthSnapshot): Promise<{ groups: EmptyGroup[]; from: ISODate; to: ISODate; partial: boolean }> {
  const to = resolveAsOf(snap);
  let from = addDays(to, -(KOSONG_DAYS - 1));
  let lines = snap.lines;
  let partial = false;
  if (from < monthStart(snap.month)) {
    const prev = await getMonthLines(prevMonth(snap.month)).catch(() => null);
    if (prev) lines = [...prev.lines, ...lines];
    else {
      partial = true;
      from = monthStart(snap.month);
    }
  }
  return { groups: emptyStock(soh.items, soh.categories, lines, from, to), from, to, partial };
}
