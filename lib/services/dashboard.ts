import "server-only";
import { appConfig } from "@/config/app";
import { DEFAULT_RULES, type BusinessRules } from "@/config/business";
import { cached, invalidate, shared } from "@/lib/cache";
import { enrichSales } from "@/lib/domain/kpi";
import { monthEnd, monthStart, todayIn } from "@/lib/domain/period";
import { reconcile } from "@/lib/domain/reconcile";
import { lastDataDate, type MonthInput } from "@/lib/domain/views";
import type { ControlSheetData } from "@/lib/parsers/controlSheet";
import { dataSource, type HistorySummary, type MonthEntry } from "@/lib/repositories";
import { historyLines } from "@/lib/domain/history";
import type { ISODate, MerchLine, MonthKey, ReconcileIssue, SalesLine, TrafficEntry } from "@/types/domain";
import { EMPTY_EXTRAS, type MonthExtras } from "@/types/extras";

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
  extras: MonthExtras;
  /** Days whose traffic came from the app input (others from the sheet's Traffic tab). */
  trafficFromApp: number;
}

/** App-entered traffic wins over the sheet's Traffic tab for the same date. */
function mergeTraffic(app: TrafficEntry[], sheet: TrafficEntry[]): TrafficEntry[] {
  const m = new Map(sheet.map((t) => [t.date, t.traffic]));
  for (const t of app) if (t.traffic > 0) m.set(t.date, t.traffic);
  return [...m.entries()].map(([date, traffic]) => ({ date, traffic })).sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeRules(o: Partial<BusinessRules>): BusinessRules {
  const inc = o.incentive ?? ({} as Partial<BusinessRules["incentive"]>);
  return {
    ...DEFAULT_RULES,
    ...o,
    pointCaps: { ...DEFAULT_RULES.pointCaps, ...(o.pointCaps ?? {}) },
    incentive: { perUnit: inc.perUnit ?? DEFAULT_RULES.incentive.perUnit, qoalaTiers: inc.qoalaTiers ?? DEFAULT_RULES.incentive.qoalaTiers },
  };
}

/** Shared (cross-instance) revalidate window = CACHE_TTL_SECONDS. */
const sharedSec = () => appConfig().cacheTtlMs / 1000;
/**
 * Memory layer in front of the shared cache. Short, so a Refresh/Import done on
 * another instance shows up here within a minute; a Data Cache hit is cheap.
 */
const memTtl = () => Math.min(appConfig().cacheTtlMs, 60_000);

export async function getRules(force = false): Promise<BusinessRules> {
  const { value } = await cached(
    "rules",
    memTtl(),
    () => shared(["rules"], ["rules"], sharedSec(), async () => mergeRules(await dataSource().getRuleOverrides()), force),
    force,
  );
  return value;
}

/** The month registry is tiny and changes only from Settings (which expires the "months" tag). */
const MONTHS_TTL_MS = 30_000;

export async function getMonths(force = false): Promise<MonthEntry[]> {
  const { value } = await cached(
    "months",
    Math.min(appConfig().cacheTtlMs, MONTHS_TTL_MS),
    () => shared(["months"], ["months"], sharedSec(), () => dataSource().listMonths(), force),
    force,
  );
  return value;
}

/** Load + parse + enrich one month. Cached; `force` re-reads the spreadsheet. */
export async function getMonthSnapshot(month: MonthKey, force = false): Promise<MonthSnapshot> {
  const entry = (await getMonths(force)).find((m) => m.month === month);
  if (!entry) throw new Error(`Bulan ${month} belum didaftarkan. Admin: daftarkan link sheet di Settings.`);
  // Independent reads run in parallel (was: one after another).
  const [rules, raw, traffic] = await Promise.all([
    getRules(force),
    cached(
      `month:${month}:raw`,
      memTtl(),
      () =>
        shared(
          ["month-raw", month, entry.spreadsheetId],
          [`month:${month}`, `month:${month}:raw`],
          sharedSec(),
          async () => ({ raw: await dataSource().loadMonth(entry), readAt: Date.now() }),
          force,
        ),
      force,
    ),
    cached(
      `month:${month}:traffic`,
      memTtl(),
      () => shared(["traffic", month], [`month:${month}`, `month:${month}:traffic`], sharedSec(), () => dataSource().getTraffic(month), force),
      force,
    ),
  ]);
  const { control, target, sourceTitle, errors } = raw.value.raw;
  const extras = raw.value.raw.extras ?? EMPTY_EXTRAS;
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
    traffic: mergeTraffic(traffic.value, extras.sheetTraffic),
    trafficFromApp: traffic.value.filter((t) => t.traffic > 0).length,
    extras,
    skippedOtherMonth: control.skippedOtherMonth,
    warnings: [...errors, ...control.warnings, ...extras.warnings],
    issues: reconcile(lines, control.merch),
    lastDataDate: lastDataDate(lines),
    // when the spreadsheet was actually read (not when the cache was hit)
    loadedAt: raw.value.readAt,
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

/** Drops every cache layer on every instance (admin ↻ Perbarui). */
export function refreshAll(): void {
  invalidate();
}

export function invalidateMonth(month: MonthKey, part: "raw" | "traffic" | "all" = "all"): void {
  invalidate(part === "all" ? `month:${month}:` : `month:${month}:${part}`);
}

/* ---------------- last-year data imported from a Merchandise Report ---------------- */

export async function getHistoryList(force = false): Promise<HistorySummary[]> {
  const { value } = await cached("history:list", memTtl(), () => shared(["history-list"], ["history"], sharedSec(), () => dataSource().listHistory(), force), force);
  return value;
}

/** Sales lines of an imported last-year month (null when that month was not imported). */
export async function getHistoryLines(month: MonthKey, force = false): Promise<SalesLine[] | null> {
  const [rules, list] = await Promise.all([getRules(force), getHistoryList(force)]);
  if (!list.some((h) => h.month === month)) return null;
  const { value } = await cached(`history:${month}`, memTtl(), () => shared(["history", month], ["history"], sharedSec(), () => dataSource().getHistory(month), force), force);
  return historyLines(value, rules);
}

export function invalidateHistory(): void {
  invalidate("history");
}

/**
 * Lines of any month for comparisons: the registered monthly sheet when there is one, otherwise an
 * imported Merchandise Report (last-year months). `source` tells which; null = no data.
 */
export async function getMonthLines(month: MonthKey, months?: MonthEntry[]): Promise<{ lines: SalesLine[]; source: "sheet" | "mr" } | null> {
  const list = months ?? (await getMonths());
  if (list.some((m) => m.month === month)) {
    try {
      return { lines: (await getMonthSnapshot(month)).lines, source: "sheet" };
    } catch {
      // fall through to an imported MR, if any
    }
  }
  const h = await getHistoryLines(month).catch(() => null);
  return h ? { lines: h, source: "mr" } : null;
}
