import type { BusinessRules } from "@/config/business";
import type { ControlSheetData } from "@/lib/parsers/controlSheet";
import type { ISODate, MonthKey, StoreTarget, TrafficEntry } from "@/types/domain";

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
}

export type { ISODate };
