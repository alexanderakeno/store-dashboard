import type { BusinessRules } from "@/config/business";
import type { ControlSheetData } from "@/lib/parsers/controlSheet";
import type { ISODate, MonthKey, StoreTarget, TrafficEntry } from "@/types/domain";
import type { MonthExtras } from "@/types/extras";
import type { SohSnapshot } from "@/types/soh";
import type { PriceItem, PriceKind, PriceList, QoalaTier } from "@/types/pricelist";

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

export interface PriceListInput {
  kinds: PriceKind[];
  date: string | null;
  source: string;
  items: PriceItem[];
  qoala: QoalaTier[];
}

export type { ISODate };
