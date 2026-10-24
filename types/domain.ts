/** Data contracts shared by repositories, calculation and UI. */

export type Group = "Apple" | "Android" | "ACC" | "VAS";
export const GROUPS: readonly Group[] = ["Apple", "Android", "ACC", "VAS"] as const;

/** ISO date `YYYY-MM-DD` in store timezone. */
export type ISODate = string;
/** Month key `YYYY-MM`. */
export type MonthKey = string;

/** One line of the Merchandise Report block (has qty, no staff/invoice). */
export interface MerchLine {
  date: ISODate;
  brand: string;
  division: string;
  productGroup: string; // DEVICES | ACCESSORIES | MOTORIZED | MERCHANDISE | SUPPORTING
  category: string;
  article: string;
  description: string;
  qty: number;
  discount: number;
  net: number;
}

/** One line of the Sales Person block (has staff/invoice, no qty). */
export interface SalesLineRaw {
  date: ISODate;
  nik: string | null;
  staffName: string;
  article: string;
  description: string;
  invoice: string;
  amount: number;
  type: string; // DEVICES | ACCESSORIES | ...
  brand: string;
  category: string;
}

export type QtySource = "exact" | "free" | "uncertain";

/** Sales line after normalization, classification and qty inference. */
export interface SalesLine extends SalesLineRaw {
  group: Group;
  lob: string | null; // iPhone, iPad, Mac, Apple Watch, AirPods, Samsung, ...
  vasProvider: string | null; // Qoala, Telkomsel, XL, Indosat
  supplier: string | null; // ACC supplier (Dino, iBack, ...)
  isChannel: boolean; // online channel (not a staff)
  qty: number;
  qtySource: QtySource;
  countsInQty: boolean;
}

export interface StaffTarget {
  name: string;
  sharePct: number; // 0..1
  byGroup: Record<Group, number>;
  byColumn: Record<string, number>; // per LOB/brand/supplier/provider column
  total: number;
}

export interface TargetSection {
  group: Group;
  columns: string[]; // e.g. iPhone, iPad, Mac, Apple Watch
  columnTargets: Record<string, number>;
  total: number;
}

export interface StoreTarget {
  month: MonthKey;
  total: number;
  byGroup: Record<Group, number>;
  sections: Partial<Record<Group, TargetSection>>;
  staff: StaffTarget[];
  /** Store target per Android brand from the "Total Target" block at the top of Target Store (Samsung, Xiaomi, …). */
  brands?: Record<string, number>;
}

export interface StaffMember {
  nik: string | null;
  name: string;
  aliases: string[];
  role: string | null;
  active: boolean;
}

export interface TrafficEntry {
  date: ISODate;
  traffic: number;
}

export interface Totals {
  sales: number;
  byGroup: Record<Group, number>;
  qty: number;
  qtyByGroup: Record<Group, number>;
  invoices: number;
  upt: number | null;
  atv: number | null;
  lines: number;
}

export interface Achievement {
  actual: number;
  target: number;
  achievementPct: number | null;
  gap: number;
}

export interface ReconcileIssue {
  check: string;
  severity: "error" | "warning" | "info";
  detail: string;
  expected?: number;
  actual?: number;
}
