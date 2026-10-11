/** Optional data read from extra tabs of the monthly sheet (CX&GR Tracker, Rekap Promo, Traffic). */
import type { ISODate, TrafficEntry } from "./domain";

export interface TrackerDay {
  date: ISODate;
  byStaff: Record<string, number>;
  total: number;
  invoices: number | null;
}

export interface Tracker {
  title: string; // "CX" / "GR"
  staff: string[];
  days: TrackerDay[];
}

export interface PromoItem {
  promo: string;
  note: string;
}

export interface PromoBrand {
  brand: string;
  items: PromoItem[];
}

export interface MonthExtras {
  cx: Tracker | null;
  gr: Tracker | null;
  promo: PromoBrand[] | null;
  sheetTraffic: TrafficEntry[];
  /** Tab names that were found and read. */
  tabs: string[];
  warnings: string[];
}

export const EMPTY_EXTRAS: MonthExtras = { cx: null, gr: null, promo: null, sheetTraffic: [], tabs: [], warnings: [] };
