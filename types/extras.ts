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

export interface AccFocusCell {
  qty: number;
  amount: number;
  /** Incentive as calculated in the sheet. */
  fee: number;
}

/** "LEADERBOARD ACC FOKUS" block of tab `Data - Akeno`: ACC incentive per staff per supplier. */
export interface AccFocusBoard {
  /** e.g. "LEADERBOARD ACC FOKUS - MTD 20/Okt/26" */
  title: string;
  suppliers: string[];
  staff: Array<{ name: string; bySupplier: Record<string, AccFocusCell>; total: AccFocusCell }>;
}

/** Target table of tab `Dashboard` (B6:G17): monthly target per staff per group, as written in the sheet. */
export interface DashTarget {
  /** Column labels after the name, e.g. Apple · Android · Accesories · VAS · Total. */
  cols: string[];
  rows: Array<{ name: string; values: number[] }>;
  /** The sheet's own "Total" row (null when missing). */
  total: number[] | null;
}

export interface MonthExtras {
  cx: Tracker | null;
  gr: Tracker | null;
  promo: PromoBrand[] | null;
  sheetTraffic: TrafficEntry[];
  /** ACC Fokus incentive from tab `Data - Akeno` (null = tab/block not found). */
  accFocus?: AccFocusBoard | null;
  /** Target table from tab `Dashboard` B6:G17 (null = tab/table not found, undefined = read before this existed). */
  dashTarget?: DashTarget | null;
  /** Tab names that were found and read. */
  tabs: string[];
  warnings: string[];
}

export const EMPTY_EXTRAS: MonthExtras = { cx: null, gr: null, promo: null, sheetTraffic: [], tabs: [], warnings: [] };
