import "server-only";
import { appConfig } from "@/config/app";
import { cached, invalidate } from "@/lib/cache";
import { dataSource } from "@/lib/repositories";
import { getSoh } from "@/lib/soh";
import { getAccPriceList } from "@/lib/accPrice";
import { getMonthSnapshot } from "@/lib/services/dashboard";
import { addDays, prevMonth, todayIn } from "@/lib/domain/period";
import { normalizeNik } from "@/lib/domain/normalize";
import { assignItems, assignRecount, finalOf, isChecked, monitorView, selectItems, stokanLabel, tally } from "@/lib/domain/stokan";
import type { StokanEvent, StokanItem, StokanMode, StokanSession, StokanStaff } from "@/types/stokan";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** Sessions, newest first (memory cache of a few seconds: every phone asks while counting). */
export async function listSessions(): Promise<StokanSession[]> {
  const { value } = await cached("stokan:list", 5_000, () => dataSource().listStokan());
  return value;
}

/** The running session (count or recount), if any. */
export async function activeSession(): Promise<StokanSession | null> {
  return (await listSessions()).find((s) => s.status === "count" || s.status === "recount") ?? null;
}

export async function sessionItems(id: string): Promise<StokanItem[]> {
  const { value } = await cached(`stokan:items:${id}`, 10_000, () => dataSource().getStokanItems(id));
  return value;
}

/** People who can count: the app users (active) + the admin. */
export async function staffCandidates(): Promise<StokanStaff[]> {
  const cfg = appConfig();
  // the user list changes rarely: one Sheets read per minute instead of one per page view
  const users = await cached("stokan:users", 60_000, () => dataSource().listUsers())
    .then((x) => x.value)
    .catch(() => []);
  const out: StokanStaff[] = users.filter((u) => u.active).map((u) => ({ nik: u.nik, name: u.name || u.nik }));
  const admin = normalizeNik(cfg.adminNik) ?? cfg.adminNik;
  if (admin && !out.some((s) => s.nik === admin)) out.push({ nik: admin, name: cfg.adminName || "Admin" });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Articles sold in the last 7 days (this month's lines, plus last month's early in the month). */
async function soldLastWeek(): Promise<Set<string>> {
  const today = todayIn(appConfig().timeZone);
  const from = addDays(today, -7);
  const out = new Set<string>();
  for (const m of new Set([today.slice(0, 7), prevMonth(today.slice(0, 7))])) {
    if (m < from.slice(0, 7)) continue;
    const snap = await getMonthSnapshot(m).catch(() => null);
    for (const l of snap?.lines ?? []) if (l.date >= from && l.qty > 0) out.add(l.article.trim().toUpperCase());
  }
  return out;
}

/** Articles with a confirmed difference in the last 4 closed sessions. */
async function previousDiffs(sessions: StokanSession[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const s of sessions.filter((x) => x.status === "closed").slice(0, 4)) for (const x of await dataSource().getStokanItems(s.id)) if (x.final != null && x.final !== x.expected) out.add(x.article);
  return out;
}

/** Preview of a new session (how many articles per reason) without saving. */
export async function previewStart(mode: StokanMode) {
  const [soh, acc, sold, sessions] = await Promise.all([getSoh(), getAccPriceList().catch(() => null), soldLastWeek(), listSessions()]);
  if (!soh) throw new Error("Belum ada SOH — import SOH dulu.");
  const items = selectItems({ soh: soh.items, acc: acc?.items ?? [], sold, prevDiff: await previousDiffs(sessions), mode, seed: new Date().toISOString().slice(0, 10) });
  const reasons: Record<string, number> = {};
  for (const x of items) reasons[x.reason] = (reasons[x.reason] ?? 0) + 1;
  const brands = new Map<string, { brand: string; items: number; units: number }>();
  for (const x of items) {
    const b = brands.get(x.brand) ?? { brand: x.brand, items: 0, units: 0 };
    b.items++;
    b.units += x.expected;
    brands.set(x.brand, b);
  }
  return { items: items.length, units: items.reduce((a, x) => a + x.expected, 0), reasons, brands: [...brands.values()].sort((a, b) => b.items - a.items || a.brand.localeCompare(b.brand)), sohDate: soh.date, sohUpdatedAt: soh.updatedAt };
}

/**
 * `manual` = the admin's split: brand → staff NIK ("" = this brand is not counted). Brands it does not mention are
 * split automatically between the staff.
 */
export async function startSession(mode: StokanMode, staff: StokanStaff[], by: string, manual?: Record<string, string>): Promise<StokanSession> {
  if (await activeSession()) throw new Error("Masih ada stokan yang berjalan — selesaikan atau batalkan dulu.");
  if (!staff.length) throw new Error("Pilih minimal 1 staff.");
  const [soh, acc, sold, sessions] = await Promise.all([getSoh(), getAccPriceList().catch(() => null), soldLastWeek(), dataSource().listStokan()]);
  if (!soh) throw new Error("Belum ada SOH — import SOH dulu.");
  const now = new Date();
  const id = now.toISOString();
  const picked = selectItems({ soh: soh.items, acc: acc?.items ?? [], sold, prevDiff: await previousDiffs(sessions), mode, seed: id.slice(0, 10) });
  if (!picked.length) throw new Error("Tidak ada aksesoris dengan stok di SOH.");
  let items: StokanItem[];
  if (manual && Object.keys(manual).length) {
    const niks = new Set(staff.map((x) => x.nik));
    const fixed = picked.filter((x) => x.brand in manual && niks.has(manual[x.brand])).map((x) => ({ ...x, assignee: manual[x.brand] }));
    const rest = picked.filter((x) => !(x.brand in manual));
    items = [...fixed, ...assignItems(rest, staff, sessions.length)];
    if (!items.length) throw new Error("Tidak ada brand yang dibagikan ke staff.");
  } else items = assignItems(picked, staff, sessions.length);
  const today = todayIn(appConfig().timeZone);
  const session: StokanSession = { id, label: `${stokanLabel(today, MONTHS[Number(today.slice(5, 7)) - 1])}${mode === "full" ? " · Penuh" : ""}`, mode, status: "count", startedAt: id, startedBy: by, sohDate: soh.date, sohUpdatedAt: soh.updatedAt, staff };
  // items first: a session row without its items would show an empty count
  await dataSource().saveStokanItems(id, items);
  await dataSource().saveStokan(session);
  invalidate("stokan:");
  return session;
}

export async function sessionById(id: string) {
  return (await listSessions()).find((s) => s.id === id) ?? null;
}

export async function monitor(id: string) {
  const s = await sessionById(id);
  if (!s) throw new Error("Stokan tidak ditemukan");
  const [items, events] = await Promise.all([sessionItems(id), dataSource().getStokanLog(id)]);
  return { session: s, items, events, view: monitorView(s, items, events, new Date()) };
}

/** Admin: first count done → the differences go to another staff for a recount. */
export async function startRecount(id: string): Promise<number> {
  const s = await sessionById(id);
  if (!s || s.status !== "count") throw new Error("Stokan ini tidak dalam tahap hitung.");
  const [items, events] = await Promise.all([dataSource().getStokanItems(id), dataSource().getStokanLog(id)]);
  const next = assignRecount(items, tally(events), s.staff);
  await dataSource().saveStokanItems(id, next);
  await dataSource().saveStokan({ ...s, status: "recount", recountAt: new Date().toISOString() });
  invalidate("stokan:");
  return next.filter((x) => x.recount).length;
}

/** Admin: closes the session — the final counts are written to the items (history, next week's picks). */
export async function closeSession(id: string, cancel = false): Promise<StokanSession> {
  const s = await sessionById(id);
  if (!s || (s.status !== "count" && s.status !== "recount")) throw new Error("Stokan ini sudah ditutup.");
  if (cancel) {
    const x = { ...s, status: "cancelled" as const, closedAt: new Date().toISOString() };
    await dataSource().saveStokan(x);
    invalidate("stokan:");
    return x;
  }
  const [items, events] = await Promise.all([dataSource().getStokanItems(id), dataSource().getStokanLog(id)]);
  const t = tally(events);
  // articles nobody checked keep no final count (not a difference, not "pernah selisih" next week)
  const final = items.map((x) => (isChecked(t, x) ? { ...x, final: finalOf(t, x.article) } : x));
  const v = monitorView({ ...s, status: "closed" }, final, events, new Date());
  await dataSource().saveStokanItems(id, final);
  const closed: StokanSession = { ...s, status: "closed", closedAt: new Date().toISOString(), summary: { items: v.items, matched: v.matched, diff: v.diff, diffValue: v.diffValue, units: v.units, counted: final.reduce((a, x) => a + (x.final ?? 0), 0) } };
  await dataSource().saveStokan(closed);
  // keep the counting log of the last 8 sessions only
  const keep = [closed, ...(await dataSource().listStokan()).filter((x) => x.id !== id)].slice(0, 8).map((x) => x.id);
  await dataSource().pruneStokanLog(keep).catch(() => {});
  invalidate("stokan:");
  return closed;
}

export async function appendEvents(id: string, events: StokanEvent[]) {
  await dataSource().appendStokanLog(id, events);
}

/** Admin: moves every article of a brand to another staff while the count runs (counts stay — they are per article). */
export async function reassignBrand(id: string, brand: string, nik: string): Promise<number> {
  const s = await sessionById(id);
  if (!s || s.status !== "count") throw new Error("Bagian hanya bisa diubah saat tahap hitung.");
  if (!s.staff.some((x) => x.nik === nik)) throw new Error("Staff tidak ikut stokan ini.");
  const items = await dataSource().getStokanItems(id);
  let n = 0;
  const next = items.map((x) => (x.brand === brand && x.assignee !== nik ? (n++, { ...x, assignee: nik }) : x));
  if (n) await dataSource().saveStokanItems(id, next);
  invalidate("stokan:");
  return n;
}
