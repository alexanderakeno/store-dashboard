import type { BusinessRules } from "@/config/business";
import type { ControlSheetData } from "@/lib/parsers/controlSheet";
import type { ISODate, MerchLine, MonthKey, StoreTarget, TrafficEntry } from "@/types/domain";
import type { MonthExtras } from "@/types/extras";
import type { SohSnapshot } from "@/types/soh";
import type { PriceItem, PriceKind, PriceList, QoalaTier } from "@/types/pricelist";
import type { AccessEntry } from "@/types/access";

/** A monthly spreadsheet registered in the app (master sheet `APP_Months`). */
export interface MonthEntry {
  month: MonthKey;
  spreadsheetId: string;
  label: string;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
}

export type Role = "admin" | "viewer";

/** Viewer accounts (master sheet `APP_Users`). Admin lives in env, never here. */
export interface AppUser {
  nik: string;
  name: string;
  role: Role;
  passwordHash: string;
  active: boolean;
}

export interface AuditEntry {
  ts: string;
  nik: string;
  action: string;
  detail: string;
}

export interface MonthRaw {
  control: ControlSheetData;
  target: StoreTarget | null;
  sourceTitle: string;
  errors: string[];
  /** Optional tabs (CX&GR Tracker, Rekap Promo, Traffic). */
  extras?: MonthExtras;
}

/** App inputs (BNPL, feedback, weekly reason, checklist…) stored in master sheet `APP_Records`. */
export type RecordKind = "bnpl" | "feedback" | "reason" | "checklist-spv" | "checklist-staff";
export const RECORD_KINDS: readonly RecordKind[] = ["bnpl", "feedback", "reason", "checklist-spv", "checklist-staff"];

export interface AppRecord {
  kind: RecordKind;
  /** ISO date (or week start for weekly reason). */
  date: ISODate;
  key: string;
  data: Record<string, string | number | boolean>;
  updatedAt: string;
  updatedBy: string;
}

export interface SourceCheck {
  title: string;
  sheets: string[];
  hasSales: boolean;
  hasTarget: boolean;
}

/**
 * Everything the app reads or writes. One implementation per backend
 * (Google Sheets in production, in-memory fixture for local development).
 */
export interface DataSource {
  readonly kind: "sheets" | "fixture";
  listMonths(): Promise<MonthEntry[]>;
  saveMonth(entry: MonthEntry): Promise<void>;
  checkSource(spreadsheetId: string): Promise<SourceCheck>;
  loadMonth(entry: MonthEntry): Promise<MonthRaw>;

  getRuleOverrides(): Promise<Partial<BusinessRules>>;
  saveRuleOverrides(overrides: Partial<BusinessRules>): Promise<void>;

  getTraffic(month: MonthKey): Promise<TrafficEntry[]>;
  saveTraffic(month: MonthKey, entries: TrafficEntry[], by: string): Promise<void>;

  listUsers(): Promise<AppUser[]>;
  saveUser(user: AppUser): Promise<void>;

  audit(entry: Omit<AuditEntry, "ts">): Promise<void>;

  /** Months of last-year Merchandise Report imported in the app (Data Upload → Import Data Penjualan). */
  listHistory(): Promise<HistorySummary[]>;
  /** MR lines of one imported month (empty when not imported). */
  getHistory(month: MonthKey): Promise<MerchLine[]>;
  /** Replaces the stored MR lines of each given month, in one write. */
  saveHistory(months: HistoryInput[], by: string): Promise<void>;

  /** Appends login / logout / page-view rows to the access log. */
  logAccess(entries: AccessEntry[]): Promise<void>;
  /** The most recent access-log rows (at most `limit`), newest first. */
  listAccess(limit: number): Promise<AccessEntry[]>;

  /** Records of one kind whose date starts with `prefix` (e.g. a month `2026-10`). */
  listRecords(kind: RecordKind, prefix: string): Promise<AppRecord[]>;
  /** Replace all records of `kind` on `date` with `rows`. */
  saveRecords(kind: RecordKind, date: ISODate, rows: Array<Pick<AppRecord, "key" | "data">>, by: string): Promise<void>;

  /** Latest imported stock on hand (null = never imported). */
  getSoh(): Promise<SohSnapshot | null>;
  /** Replaces the stored SOH with `snap`. */
  saveSoh(snap: Omit<SohSnapshot, "updatedAt" | "updatedBy">, by: string): Promise<void>;

  /** Latest imported price list (null = never imported). */
  getPriceList(): Promise<PriceList | null>;
  /**
   * Replaces the rows of `kinds` (Apple and Android are imported from separate PDFs, so one
   * import never wipes the other). `qoala` replaces the Qoala tiers when non-empty.
   */
  savePriceList(input: PriceListInput, by: string): Promise<void>;
}

export interface HistoryInput {
  month: MonthKey;
  rows: MerchLine[];
  source: string;
}

export interface HistorySummary {
  month: MonthKey;
  lines: number;
  qty: number;
  net: number;
  source: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PriceListInput {
  kinds: PriceKind[];
  date: string | null;
  source: string;
  items: PriceItem[];
  qoala: QoalaTier[];
}

export type { ISODate };
