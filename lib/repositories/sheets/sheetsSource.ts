import "server-only";
import { appConfig } from "@/config/app";
import type { BusinessRules } from "@/config/business";
import { normalizeText, parseDate, parseNumber } from "@/lib/domain/normalize";
import { parseControlSheet, type Grid } from "@/lib/parsers/controlSheet";
import { parseTargetStore } from "@/lib/parsers/targetStore";
import type { MonthKey, TrafficEntry } from "@/types/domain";
import type { AppRecord, AppUser, AuditEntry, DataSource, MonthEntry, MonthRaw, RecordKind, SourceCheck } from "../types";
import { parsePromo, parseTracker, parseTrafficTab } from "@/lib/parsers/extras";
import type { MonthExtras } from "@/types/extras";

/** Optional tabs of the monthly sheet. */
export const EXTRA_TABS = { tracker: "CX&GR Tracker", promo: "Rekap Promo", traffic: "Traffic" } as const;
import { SheetsError, addTab, appendRows, clearRange, getSpreadsheetMeta, readTab, readTabs, writeRange } from "./client";

/** Master-sheet tabs owned by the app. Header order = column order. */
export const MASTER_TABS = {
  months: { name: "APP_Months", header: ["month", "spreadsheetId", "label", "active", "updatedAt", "updatedBy"] },
  settings: { name: "APP_Settings", header: ["key", "value", "updatedAt"] },
  users: { name: "APP_Users", header: ["nik", "name", "role", "passwordHash", "active"] },
  traffic: { name: "APP_Traffic", header: ["date", "traffic", "updatedAt", "updatedBy"] },
  audit: { name: "APP_Audit", header: ["ts", "nik", "action", "detail"] },
  records: { name: "APP_Records", header: ["kind", "date", "key", "data", "updatedAt", "updatedBy"] },
} as const;

type TabKey = keyof typeof MASTER_TABS;

const bool = (v: unknown) => v === true || /^(true|ya|yes|1)$/i.test(normalizeText(v));

function toObjects(grid: Grid): Array<Record<string, unknown>> {
  const [head, ...rows] = grid;
  if (!head) return [];
  const keys = head.map((h) => normalizeText(h));
  return rows
    .filter((r) => r.some((c) => normalizeText(c) !== ""))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}

export class SheetsSource implements DataSource {
  readonly kind = "sheets" as const;
  private ensured: Promise<void> | null = null;

  private get master() {
    return appConfig().masterSheetId;
  }

  /** Creates missing APP_* tabs once per server instance. */
  private ensureTabs(): Promise<void> {
    if (!this.ensured) {
      this.ensured = (async () => {
        const meta = await getSpreadsheetMeta(this.master);
        for (const t of Object.values(MASTER_TABS)) if (!meta.sheets.includes(t.name)) await addTab(this.master, t.name, [...t.header]);
      })().catch((e) => {
        this.ensured = null;
        throw e;
      });
    }
    return this.ensured;
  }

  /**
   * Reads a master tab directly; only when the tab is missing (fresh master sheet,
   * Sheets answers 400) are the APP_* tabs created. Saves a metadata round trip
   * on every cold start.
   */
  private async rows(tab: TabKey) {
    const name = MASTER_TABS[tab].name;
    try {
      return toObjects(await readTab(this.master, name));
    } catch (e) {
      if (!(e instanceof SheetsError) || e.status !== 400) throw e;
      await this.ensureTabs();
      return toObjects(await readTab(this.master, name));
    }
  }

  /** Small tables are rewritten whole (clear + write) — simple and consistent. */
  private async rewrite(tab: TabKey, rows: unknown[][]) {
    await this.ensureTabs();
    const t = MASTER_TABS[tab];
    await clearRange(this.master, t.name, "A2:Z");
    if (rows.length) await writeRange(this.master, t.name, "A2", rows);
  }

  async listMonths(): Promise<MonthEntry[]> {
    return (await this.rows("months"))
      .map((r) => ({
        month: normalizeText(r.month),
        spreadsheetId: normalizeText(r.spreadsheetId),
        label: normalizeText(r.label),
        active: r.active === "" ? true : bool(r.active),
        updatedAt: normalizeText(r.updatedAt),
        updatedBy: normalizeText(r.updatedBy),
      }))
      .filter((m) => /^\d{4}-\d{2}$/.test(m.month) && m.spreadsheetId)
      .sort((a, b) => b.month.localeCompare(a.month));
  }

  async saveMonth(entry: MonthEntry): Promise<void> {
    const all = (await this.listMonths()).filter((m) => m.month !== entry.month);
    all.push(entry);
    all.sort((a, b) => a.month.localeCompare(b.month));
    await this.rewrite("months", all.map((m) => [m.month, m.spreadsheetId, m.label, m.active, m.updatedAt, m.updatedBy]));
  }

  async checkSource(spreadsheetId: string): Promise<SourceCheck> {
    const cfg = appConfig();
    const meta = await getSpreadsheetMeta(spreadsheetId);
    return { ...meta, hasSales: meta.sheets.includes(cfg.salesSheetName), hasTarget: meta.sheets.includes(cfg.targetSheetName) };
  }

  async loadMonth(entry: MonthEntry): Promise<MonthRaw> {
    const cfg = appConfig();
    const meta = await this.checkSource(entry.spreadsheetId);
    if (!meta.hasSales) throw new Error(`Tab '${cfg.salesSheetName}' tidak ada di file "${meta.title}"`);
    const optional = Object.values(EXTRA_TABS).filter((x) => meta.sheets.includes(x));
    const tabs = [...(meta.hasTarget ? [cfg.salesSheetName, cfg.targetSheetName] : [cfg.salesSheetName]), ...optional];
    const grids = await readTabs(entry.spreadsheetId, tabs);
    const errors: string[] = [];
    const control = parseControlSheet(grids[cfg.salesSheetName], entry.month);
    let target = null;
    if (meta.hasTarget) {
      try {
        target = parseTargetStore(grids[cfg.targetSheetName], entry.month);
      } catch (e) {
        errors.push(`Target Store gagal dibaca: ${(e as Error).message}`);
      }
    } else errors.push(`Tab '${cfg.targetSheetName}' tidak ada — target dianggap 0`);
    const extras: MonthExtras = { cx: null, gr: null, promo: null, sheetTraffic: [], tabs: optional, warnings: [] };
    try {
      if (grids[EXTRA_TABS.tracker]) {
        extras.cx = parseTracker(grids[EXTRA_TABS.tracker], entry.month, "CX");
        extras.gr = parseTracker(grids[EXTRA_TABS.tracker], entry.month, "GR");
      }
      if (grids[EXTRA_TABS.promo]) extras.promo = parsePromo(grids[EXTRA_TABS.promo]);
      if (grids[EXTRA_TABS.traffic]) extras.sheetTraffic = parseTrafficTab(grids[EXTRA_TABS.traffic], entry.month);
    } catch (e) {
      extras.warnings.push(`Tab tambahan gagal dibaca: ${(e as Error).message}`);
    }
    return { control, target, sourceTitle: meta.title, errors, extras };
  }

  async getRuleOverrides(): Promise<Partial<BusinessRules>> {
    const row = (await this.rows("settings")).find((r) => normalizeText(r.key) === "rules");
    if (!row) return {};
    try {
      return JSON.parse(String(row.value)) as Partial<BusinessRules>;
    } catch {
      return {};
    }
  }

  async saveRuleOverrides(overrides: Partial<BusinessRules>): Promise<void> {
    const rows = (await this.rows("settings")).filter((r) => normalizeText(r.key) !== "rules");
    const out = rows.map((r) => [r.key, r.value, r.updatedAt]);
    out.push(["rules", JSON.stringify(overrides), new Date().toISOString()]);
    await this.rewrite("settings", out);
  }

  async getTraffic(month: MonthKey): Promise<TrafficEntry[]> {
    return (await this.rows("traffic"))
      .map((r) => ({ date: parseDate(r.date) ?? "", traffic: parseNumber(r.traffic) }))
      .filter((t) => t.date.startsWith(month));
  }

  async saveTraffic(month: MonthKey, entries: TrafficEntry[], by: string): Promise<void> {
    const now = new Date().toISOString();
    const keep = (await this.rows("traffic")).filter((r) => !(parseDate(r.date) ?? "").startsWith(month));
    const out: unknown[][] = keep.map((r) => [parseDate(r.date) ?? normalizeText(r.date), r.traffic, r.updatedAt, r.updatedBy]);
    for (const e of entries) if (e.traffic > 0) out.push([e.date, e.traffic, now, by]);
    out.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    await this.rewrite("traffic", out);
  }

  async listUsers(): Promise<AppUser[]> {
    return (await this.rows("users"))
      .map((r) => ({
        nik: normalizeText(r.nik),
        name: normalizeText(r.name),
        role: "viewer" as const, // admin is env-only; a sheet row can never grant admin
        passwordHash: normalizeText(r.passwordHash),
        active: r.active === "" ? true : bool(r.active),
      }))
      .filter((u) => u.nik);
  }

  async saveUser(user: AppUser): Promise<void> {
    const all = (await this.listUsers()).filter((u) => u.nik !== user.nik);
    all.push(user);
    await this.rewrite("users", all.map((u) => [u.nik, u.name, "viewer", u.passwordHash, u.active]));
  }

  async listRecords(kind: RecordKind, prefix: string): Promise<AppRecord[]> {
    return (await this.rows("records")).map(toRecord).filter((r): r is AppRecord => !!r && r.kind === kind && r.date.startsWith(prefix));
  }

  async saveRecords(kind: RecordKind, date: string, rows: Array<Pick<AppRecord, "key" | "data">>, by: string): Promise<void> {
    const now = new Date().toISOString();
    const keep = (await this.rows("records")).filter((r) => !(normalizeText(r.kind) === kind && normalizeText(r.date) === date));
    const out: unknown[][] = keep.map((r) => [r.kind, r.date, r.key, r.data, r.updatedAt, r.updatedBy]);
    for (const x of rows) out.push([kind, date, x.key, JSON.stringify(x.data), now, by]);
    out.sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])));
    await this.rewrite("records", out);
  }

  async audit(entry: Omit<AuditEntry, "ts">): Promise<void> {
    await this.ensureTabs();
    await appendRows(this.master, MASTER_TABS.audit.name, [[new Date().toISOString(), entry.nik, entry.action, entry.detail]]);
  }
}

function toRecord(r: Record<string, unknown>): AppRecord | null {
  const kind = normalizeText(r.kind) as RecordKind;
  const date = normalizeText(r.date);
  if (!kind || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let data: AppRecord["data"] = {};
  try {
    data = JSON.parse(String(r.data || "{}"));
  } catch {}
  return { kind, date, key: normalizeText(r.key), data, updatedAt: normalizeText(r.updatedAt), updatedBy: normalizeText(r.updatedBy) };
}
