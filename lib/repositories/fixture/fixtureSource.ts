import "server-only";
import { appConfig } from "@/config/app";
import type { BusinessRules } from "@/config/business";
import { monthEnd, prevMonth, todayIn, addDays } from "@/lib/domain/period";
import { parseControlSheet } from "@/lib/parsers/controlSheet";
import { parseTargetStore } from "@/lib/parsers/targetStore";
import type { MonthKey, TrafficEntry } from "@/types/domain";
import type { AppRecord, AppUser, AuditEntry, DataSource, HistorySummary, MonthEntry, MonthRaw, RecordKind, SourceCheck } from "../types";
import type { MerchLine } from "@/types/domain";
import { parseAccFocus, parsePromo, parseTracker } from "@/lib/parsers/extras";
import { generateExtras, generateMonth } from "./generate";
import type { SohSnapshot } from "@/types/soh";
import type { PriceList } from "@/types/pricelist";
import type { PriceListInput } from "../types";
import type { AccessEntry } from "@/types/access";

/**
 * In-memory data source with synthetic data — local development only.
 * Writes live until the dev server restarts.
 */
interface Store {
  months: MonthEntry[];
  rules: Partial<BusinessRules>;
  traffic: TrafficEntry[];
  users: AppUser[];
  audit: AuditEntry[];
  access: AccessEntry[];
  history: Record<string, { rows: MerchLine[]; source: string; updatedAt: string; updatedBy: string }>;
  records: AppRecord[];
  soh: SohSnapshot | null;
  priceList: PriceList | null;
}

const g = globalThis as unknown as { __fixtureStore?: Store };

function store(): Store {
  if (g.__fixtureStore) return g.__fixtureStore;
  const today = todayIn(appConfig().timeZone);
  const cur = today.slice(0, 7);
  const months = [prevMonth(cur), cur].map((m) => ({
    month: m,
    spreadsheetId: `fixture-${m}`,
    label: `Synthetic ${m}`,
    active: true,
    updatedAt: new Date().toISOString(),
    updatedBy: "fixture",
  }));
  // synthetic traffic: ~ 4–6× invoices
  const traffic: TrafficEntry[] = [];
  for (const m of months) {
    const end = m.month === cur ? addDays(today, -1) : monthEnd(m.month);
    for (let d = `${m.month}-01`; d <= end; d = addDays(d, 1)) traffic.push({ date: d, traffic: 60 + ((Number(d.slice(8)) * 37) % 40) });
  }
  g.__fixtureStore = { months, rules: {}, traffic, users: [], audit: [], access: [], history: {}, records: [], soh: null, priceList: null };
  return g.__fixtureStore;
}

export class FixtureSource implements DataSource {
  readonly kind = "fixture" as const;

  async listMonths() {
    return [...store().months].sort((a, b) => b.month.localeCompare(a.month));
  }
  async saveMonth(entry: MonthEntry) {
    const s = store();
    s.months = [...s.months.filter((m) => m.month !== entry.month), entry];
  }
  async checkSource(spreadsheetId: string): Promise<SourceCheck> {
    return { title: `Synthetic (${spreadsheetId})`, sheets: ["Control MR &SP", "Target Store"], hasSales: true, hasTarget: true };
  }
  async loadMonth(entry: MonthEntry): Promise<MonthRaw> {
    const today = todayIn(appConfig().timeZone);
    // data imported up to yesterday, like the real monthly file
    const last = entry.month === today.slice(0, 7) ? addDays(today, -1) : monthEnd(entry.month);
    const { control, target } = generateMonth(entry.month, last);
    const x = generateExtras(entry.month, last);
    return {
      control: parseControlSheet(control, entry.month),
      target: parseTargetStore(target, entry.month),
      sourceTitle: `Synthetic data ${entry.month}`,
      errors: [],
      extras: {
        cx: parseTracker(x.tracker, entry.month, "CX"),
        gr: parseTracker(x.tracker, entry.month, "GR"),
        promo: parsePromo(x.promo),
        sheetTraffic: [],
        accFocus: parseAccFocus(x.accFocus),
        tabs: ["CX&GR Tracker", "Rekap Promo", "Data - Akeno"],
        warnings: [],
      },
    };
  }
  async getRuleOverrides() {
    return store().rules;
  }
  async saveRuleOverrides(o: Partial<BusinessRules>) {
    store().rules = o;
  }
  async getTraffic(month: MonthKey) {
    return store().traffic.filter((t) => t.date.startsWith(month));
  }
  async saveTraffic(month: MonthKey, entries: TrafficEntry[]) {
    const s = store();
    s.traffic = [...s.traffic.filter((t) => !t.date.startsWith(month)), ...entries.filter((e) => e.traffic > 0)];
  }
  async listUsers() {
    return store().users;
  }
  async saveUser(user: AppUser) {
    const s = store();
    s.users = [...s.users.filter((u) => u.nik !== user.nik), { ...user, role: "viewer" }];
  }
  async listRecords(kind: RecordKind, prefix: string) {
    return store().records.filter((r) => r.kind === kind && r.date.startsWith(prefix));
  }
  async saveRecords(kind: RecordKind, date: string, rows: Array<Pick<AppRecord, "key" | "data">>, by: string) {
    const s = store();
    const now = new Date().toISOString();
    s.records = [...s.records.filter((r) => !(r.kind === kind && r.date === date)), ...rows.map((x) => ({ kind, date, key: x.key, data: x.data, updatedAt: now, updatedBy: by }))];
  }
  async getSoh() {
    return store().soh;
  }
  async saveSoh(snap: Omit<SohSnapshot, "updatedAt" | "updatedBy">, by: string) {
    store().soh = { ...snap, updatedAt: new Date().toISOString(), updatedBy: by };
  }
  async getPriceList() {
    return store().priceList;
  }
  async savePriceList(input: PriceListInput, _by: string) {
    const s = store();
    const now = new Date().toISOString();
    const prev = s.priceList ?? { dates: {}, items: [], qoala: [], source: {}, updatedAt: {} };
    const next: PriceList = {
      dates: { ...prev.dates },
      items: [...prev.items.filter((x) => !input.kinds.includes(x.kind)), ...input.items],
      qoala: input.qoala.length ? input.qoala : prev.qoala,
      source: { ...prev.source },
      updatedAt: { ...prev.updatedAt },
    };
    for (const k of input.kinds) {
      next.dates[k] = input.date;
      next.source[k] = input.source;
      next.updatedAt[k] = now;
    }
    s.priceList = next;
  }
  async audit(entry: Omit<AuditEntry, "ts">) {
    store().audit.push({ ts: new Date().toISOString(), ...entry });
  }
  async listHistory(): Promise<HistorySummary[]> {
    return Object.entries(store().history)
      .map(([month, h]) => ({ month, lines: h.rows.length, qty: h.rows.reduce((a, x) => a + x.qty, 0), net: h.rows.reduce((a, x) => a + x.net, 0), source: h.source, updatedAt: h.updatedAt, updatedBy: h.updatedBy }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }
  async getHistory(month: MonthKey) {
    return store().history[month]?.rows ?? [];
  }
  async saveHistory(month: MonthKey, rows: MerchLine[], source: string, by: string) {
    store().history[month] = { rows, source, updatedAt: new Date().toISOString(), updatedBy: by };
  }
  async logAccess(entries: AccessEntry[]) {
    store().access.push(...entries);
  }
  async listAccess(limit: number) {
    return [...store().access].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit);
  }
}
