import "server-only";
import { appConfig } from "@/config/app";
import { DEFAULT_RULES, type BusinessRules } from "@/config/business";
import { cached, invalidate } from "@/lib/cache";
import { enrichSales } from "@/lib/domain/kpi";
import { monthEnd, monthStart, todayIn } from "@/lib/domain/period";
import { reconcile } from "@/lib/domain/reconcile";
import { lastDataDate, type MonthInput } from "@/lib/domain/views";
import type { ControlSheetData } from "@/lib/parsers/controlSheet";
import { dataSource, type MonthEntry } from "@/lib/repositories";
import type { ISODate, MerchLine, MonthKey, ReconcileIssue } from "@/types/domain";

export interface MonthSnapshot extends MonthInput {
  entry: MonthEntry;
  sourceTitle: string;
  merch: MerchLine[];
  daily: ControlSheetData["daily"];
  skippedOtherMonth: number;
  warnings: string[];
  issues: ReconcileIssue[];
  lastDataDate: ISODate | null;
  loadedAt: number;
}

export function mergeRules(o: Partial<BusinessRules>): BusinessRules {
  return { ...DEFAULT_RULES, ...o, pointCaps: { ...DEFAULT_RULES.pointCaps, ...(o.pointCaps ?? {}) } };
}

export async function getRules(force = false): Promise<BusinessRules> {
  const { value } = await cached("rules", appConfig().cacheTtlMs, async () => mergeRules(await dataSource().getRuleOverrides()), force);
  return value;
}

export async function getMonths(force = false): Promise<MonthEntry[]> {
  const { value } = await cached("months", appConfig().cacheTtlMs, () => dataSource().listMonths(), force);
  return value;
}

/** Load + parse + enrich one month. Cached; `force` re-reads the spreadsheet. */
export async function getMonthSnapshot(month: MonthKey, force = false): Promise<MonthSnapshot> {
  const entry = (await getMonths(force)).find((m) => m.month === month);
  if (!entry) throw new Error(`Bulan ${month} belum didaftarkan. Admin: daftarkan link sheet di Settings.`);
  const rules = await getRules(force);
  const ttl = appConfig().cacheTtlMs;
  const raw = await cached(`month:${month}:raw`, ttl, () => dataSource().loadMonth(entry), force);
  const traffic = await cached(`month:${month}:traffic`, ttl, () => dataSource().getTraffic(month), force);
  const { control, target, sourceTitle, errors } = raw.value;
  const lines = enrichSales(control.sales, control.merch, rules);
  return {
    month,
    entry,
    sourceTitle,
    rules,
    lines,
    merch: control.merch,
    daily: control.daily,
    target,
    traffic: traffic.value,
    skippedOtherMonth: control.skippedOtherMonth,
    warnings: [...errors, ...control.warnings],
    issues: reconcile(lines, control.merch),
    lastDataDate: lastDataDate(lines),
    loadedAt: raw.loadedAt,
  };
}

/** Default month: today's month if registered, otherwise the latest registered. */
export async function resolveMonth(requested?: string | null): Promise<MonthKey | null> {
  const months = (await getMonths()).filter((m) => m.active);
  if (requested && months.some((m) => m.month === requested)) return requested;
  const cur = todayIn(appConfig().timeZone).slice(0, 7);
  return months.find((m) => m.month === cur)?.month ?? months[0]?.month ?? null;
}

/**
 * "As of" date for MTD/estimate: requested date if inside the month, else the last
 * date that has sales data (the file is imported up to yesterday), else today.
 */
export function resolveAsOf(s: MonthSnapshot, requested?: string | null): ISODate {
  const start = monthStart(s.month);
  const end = monthEnd(s.month);
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested >= start && requested <= end) return requested;
  if (s.lastDataDate) return s.lastDataDate;
  const today = todayIn(appConfig().timeZone);
  return today < start ? start : today > end ? end : today;
}

export function refreshAll(): void {
  invalidate();
}

export function invalidateMonth(month: MonthKey, part: "raw" | "traffic" | "all" = "all"): void {
  invalidate(part === "all" ? `month:${month}:` : `month:${month}:${part}`);
}
