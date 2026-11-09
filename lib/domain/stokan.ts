/**
 * Stokan Aksesoris — pure logic: which articles to count, who counts them, and the tally of the appended events.
 */
import type { AccPriceItem } from "@/types/accPrice";
import type { SohItem } from "@/types/soh";
import type { StokanEvent, StokanItem, StokanMode, StokanPhase, StokanReason, StokanSession, StokanStaff } from "@/types/stokan";
import { ACC_SOH_CATEGORIES, brandResolver } from "./accPrice";

/** Unit price from which an article is counted every week. */
export const HIGH_VALUE = 1_000_000;
/** Share of the other articles counted at random each week. */
export const RANDOM_SHARE = 0.2;
/** Minutes without a scan before a counting staff is flagged. */
export const IDLE_MIN = 10;

/** Deterministic pseudo random (mulberry32) — the same session id always picks the same articles. */
function rng(seed: string) {
  let a = 0;
  for (const c of seed) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) >>> 0) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SelectInput {
  soh: SohItem[];
  acc: AccPriceItem[];
  /** Articles sold in the last 7 days. */
  sold: Set<string>;
  /** Articles with a confirmed difference in recent stokan. */
  prevDiff: Set<string>;
  mode: StokanMode;
  seed: string;
}

/** Articles of the session (accessories in stock), with the reason they are counted. */
export function selectItems(i: SelectInput): Omit<StokanItem, "assignee">[] {
  const brand = brandResolver(i.acc);
  const price = new Map(i.acc.map((x) => [x.article, x.price]));
  const desc = new Map(i.acc.map((x) => [x.article, x.description]));
  const all = i.soh
    .filter((s) => ACC_SOH_CATEGORIES.includes(s.category) && s.qty > 0)
    .map((s) => {
      const a = s.article.trim().toUpperCase();
      return { article: a, description: s.description || desc.get(a) || a, brand: brand(a), category: s.category, expected: s.qty, price: price.get(a) ?? s.price ?? 0, ...(s.barcodes?.length ? { barcodes: s.barcodes } : {}) };
    });
  if (i.mode === "full") return all.map((x) => ({ ...x, reason: "full" as const }));
  const out: Omit<StokanItem, "assignee">[] = [];
  const rest: typeof all = [];
  for (const x of all) {
    const reason: StokanReason | null = x.price >= HIGH_VALUE ? "value" : i.prevDiff.has(x.article) ? "diff" : i.sold.has(x.article) ? "sold" : null;
    if (reason) out.push({ ...x, reason });
    else rest.push(x);
  }
  const r = rng(i.seed);
  const n = Math.round(rest.length * RANDOM_SHARE);
  const shuffled = rest.map((x) => [r(), x] as const).sort((a, b) => a[0] - b[0]).slice(0, n).map(([, x]) => x);
  for (const x of shuffled) out.push({ ...x, reason: "random" });
  return out;
}

/**
 * Splits the articles over the staff by brand (a brand stays with one person unless it is bigger than a fair
 * share), balancing the number of articles. `rotation` (the session number) shifts who gets which brand each week.
 */
export function assignItems(items: Omit<StokanItem, "assignee">[], staff: StokanStaff[], rotation: number): StokanItem[] {
  if (!staff.length) return [];
  const sorted = [...items].sort((a, b) => a.brand.localeCompare(b.brand) || a.category.localeCompare(b.category) || a.description.localeCompare(b.description));
  const cap = Math.max(1, Math.ceil(items.length / staff.length));
  const groups: Array<typeof sorted> = [];
  const byBrand = new Map<string, typeof sorted>();
  for (const x of sorted) (byBrand.get(x.brand) ?? byBrand.set(x.brand, []).get(x.brand)!).push(x);
  for (const g of byBrand.values()) for (let k = 0; k < g.length; k += cap) groups.push(g.slice(k, k + cap));
  groups.sort((a, b) => b.length - a.length || a[0].brand.localeCompare(b[0].brand));
  const order = staff.map((_, k) => staff[(k + rotation) % staff.length]);
  const load = new Map(order.map((s) => [s.nik, 0]));
  const out: StokanItem[] = [];
  for (const g of groups) {
    const who = order.reduce((best, s) => (load.get(s.nik)! < load.get(best.nik)! ? s : best), order[0]);
    load.set(who.nik, load.get(who.nik)! + g.length);
    for (const x of g) out.push({ ...x, assignee: who.nik });
  }
  return out;
}

export interface Tally {
  /** article → count of each phase (null = not counted). */
  counts: Map<string, { count: number | null; recount: number | null; by: Set<string> }>;
  /** nik → phases finished. */
  done: Map<string, Set<StokanPhase>>;
  /** nik → first / last action and the articles touched. */
  activity: Map<string, { first: string; last: string; articles: Set<string> }>;
  /** Scanned codes that are not in the session: code → times, article (when the list knows it), who. */
  extras: Map<string, { code: string; article: string; times: number; by: string }>;
}

/** Replays the events in time order: add = +value, set = value (per article and phase). */
export function tally(events: StokanEvent[]): Tally {
  const t: Tally = { counts: new Map(), done: new Map(), activity: new Map(), extras: new Map() };
  const seen = new Set<string>();
  for (const e of [...events].sort((a, b) => a.ts.localeCompare(b.ts))) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const act = t.activity.get(e.nik) ?? { first: e.ts, last: e.ts, articles: new Set<string>() };
    act.last = e.ts;
    t.activity.set(e.nik, act);
    if (e.kind === "done") {
      (t.done.get(e.nik) ?? t.done.set(e.nik, new Set()).get(e.nik)!).add(e.phase);
      continue;
    }
    if (e.kind === "extra") {
      const k = e.code || e.article;
      const x = t.extras.get(k) ?? { code: e.code ?? "", article: e.article, times: 0, by: e.name };
      x.times += Math.max(1, e.value);
      t.extras.set(k, x);
      continue;
    }
    act.articles.add(e.article);
    const c = t.counts.get(e.article) ?? { count: null, recount: null, by: new Set<string>() };
    const key = e.phase === "recount" ? "recount" : "count";
    c[key] = e.kind === "set" ? Math.max(0, e.value) : Math.max(0, (c[key] ?? 0) + e.value);
    c.by.add(e.nik);
    t.counts.set(e.article, c);
  }
  return t;
}

/** Count of an article for the result: the recount when there is one, else the first count (0 when never found). */
export const finalOf = (t: Tally, article: string) => {
  const c = t.counts.get(article);
  return c?.recount ?? c?.count ?? 0;
};

/**
 * An article is "checked" when someone counted it, or when its counting staff finished their part without finding it
 * (then it really is 0). Articles nobody looked at yet are left out of the differences, the recount and the result.
 */
export function isChecked(t: Tally, x: Pick<StokanItem, "article" | "assignee" | "recount">): boolean {
  const c = t.counts.get(x.article);
  if (c?.count != null || c?.recount != null) return true;
  if (t.done.get(x.assignee)?.has("count")) return true;
  return !!x.recount && !!t.done.get(x.recount)?.has("recount");
}

/**
 * Recount list: every checked article whose first count differs from the SOH (not found = 0), given to a different staff
 * than the one who counted it (round robin over the others; alone = the same person).
 */
export function assignRecount(items: StokanItem[], t: Tally, staff: StokanStaff[]): StokanItem[] {
  let k = 0;
  return items.map((x) => {
    const c = t.counts.get(x.article)?.count ?? 0;
    if (!isChecked(t, { ...x, recount: undefined }) || c === x.expected) {
      const { recount: _r, ...rest } = x;
      return rest;
    }
    const others = staff.filter((s) => s.nik !== x.assignee);
    const pool = others.length ? others : staff;
    return { ...x, recount: pool[k++ % pool.length].nik };
  });
}

export interface StaffRow {
  nik: string;
  name: string;
  brands: string[];
  assigned: number;
  counted: number;
  recountAssigned: number;
  recounted: number;
  done: boolean;
  recountDone: boolean;
  /** Articles per hour (first → last action). */
  speed: number | null;
  last: string | null;
  idle: boolean;
  /** Share of this staff's first counts that turned out right (after the recount). */
  accuracy: number | null;
}

export interface DiffRow {
  article: string;
  description: string;
  brand: string;
  expected: number;
  count: number | null;
  recount: number | null;
  final: number;
  diff: number;
  value: number;
  assignee: string;
  recountBy: string | null;
  status: "counting" | "recount" | "confirmed" | "resolved";
}

export interface MonitorView {
  items: number;
  units: number;
  counted: number;
  countedUnits: number;
  matched: number;
  diff: number;
  diffValue: number;
  confirmed: number;
  confirmedValue: number;
  recountTotal: number;
  recountDone: number;
  /** Articles nobody has checked yet (not counted, and the staff did not finish). */
  unchecked: number;
  /** Estimated finish of the first count (ISO) from the current pace. */
  eta: string | null;
  staff: StaffRow[];
  diffs: DiffRow[];
  extras: Array<{ code: string; article: string; times: number; by: string }>;
  reasons: Record<string, number>;
}

export function monitorView(session: StokanSession, items: StokanItem[], events: StokanEvent[], now: Date): MonitorView {
  const t = tally(events);
  const name = new Map(session.staff.map((s) => [s.nik, s.name]));
  const recounting = session.status !== "count";
  const counted = items.filter((x) => t.counts.get(x.article)?.count != null);
  const diffs: DiffRow[] = [];
  let matched = 0;
  for (const x of items) {
    const c = t.counts.get(x.article);
    const count = c?.count ?? null;
    const recount = c?.recount ?? null;
    if (!isChecked(t, x)) continue;
    const final = recount ?? count ?? 0;
    const first = count ?? 0;
    if (first === x.expected && recount == null) {
      matched++;
      continue;
    }
    const status: DiffRow["status"] = !recounting ? "counting" : recount == null ? (x.recount ? "recount" : "counting") : recount === x.expected ? "resolved" : "confirmed";
    if (status === "resolved") matched++;
    diffs.push({ article: x.article, description: x.description, brand: x.brand, expected: x.expected, count, recount, final, diff: final - x.expected, value: (final - x.expected) * x.price, assignee: name.get(x.assignee) ?? x.assignee, recountBy: x.recount ? (name.get(x.recount) ?? x.recount) : null, status });
  }
  const open = diffs.filter((d) => d.status !== "resolved");
  open.sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || Math.abs(b.diff) - Math.abs(a.diff));
  const confirmed = open.filter((d) => d.status === "confirmed");

  const staff: StaffRow[] = session.staff.map((s) => {
    const mine = items.filter((x) => x.assignee === s.nik);
    const re = items.filter((x) => x.recount === s.nik);
    const act = t.activity.get(s.nik);
    const cnt = mine.filter((x) => t.counts.get(x.article)?.count != null).length;
    const hours = act ? (Date.parse(act.last) - Date.parse(act.first)) / 3_600_000 : 0;
    const done = !!t.done.get(s.nik)?.has("count");
    const recountDone = !!t.done.get(s.nik)?.has("recount");
    const working = session.status === "count" ? !done && cnt < mine.length : session.status === "recount" ? re.length > 0 && !recountDone : false;
    const idle = working && !!act && now.getTime() - Date.parse(act.last) > IDLE_MIN * 60_000;
    // accuracy: of the articles this staff counted, the share whose first count is the final truth
    const judged = recounting ? mine.filter((x) => t.counts.get(x.article)?.count != null && (!x.recount || t.counts.get(x.article)!.recount != null)) : [];
    const right = judged.filter((x) => {
      const c = t.counts.get(x.article)!;
      return c.count === (x.recount ? c.recount : x.expected);
    }).length;
    return {
      nik: s.nik,
      name: s.name,
      brands: [...new Set(mine.map((x) => x.brand))].slice(0, 6),
      assigned: mine.length,
      counted: cnt,
      recountAssigned: re.length,
      recounted: re.filter((x) => t.counts.get(x.article)?.recount != null).length,
      done,
      recountDone,
      speed: act && hours > 0.05 ? Math.round(act.articles.size / hours) : null,
      last: act?.last ?? null,
      idle,
      accuracy: judged.length ? (right / judged.length) * 100 : null,
    };
  });

  // ETA: remaining articles at the combined pace of the staff still counting
  let eta: string | null = null;
  if (session.status === "count") {
    const left = items.length - counted.length;
    const pace = staff.reduce((a, s) => a + (s.speed ?? 0), 0);
    if (left > 0 && pace > 0) eta = new Date(now.getTime() + (left / pace) * 3_600_000).toISOString();
  }
  const reasons: Record<string, number> = {};
  for (const x of items) reasons[x.reason] = (reasons[x.reason] ?? 0) + 1;
  return {
    items: items.length,
    units: items.reduce((a, x) => a + x.expected, 0),
    counted: counted.length,
    countedUnits: items.reduce((a, x) => a + (t.counts.get(x.article)?.count ?? 0), 0),
    matched,
    diff: open.length,
    diffValue: open.reduce((a, d) => a + d.value, 0),
    confirmed: confirmed.length,
    confirmedValue: confirmed.reduce((a, d) => a + d.value, 0),
    unchecked: items.filter((x) => !isChecked(t, x)).length,
    recountTotal: items.filter((x) => x.recount).length,
    recountDone: items.filter((x) => x.recount && t.counts.get(x.article)?.recount != null).length,
    eta,
    staff,
    diffs: open,
    extras: [...t.extras.values()].sort((a, b) => b.times - a.times),
    reasons,
  };
}

/** Week label "W2 November" of a date (week = day 1–7 → W1 …). */
export function stokanLabel(iso: string, monthName: string): string {
  return `W${Math.ceil(Number(iso.slice(8, 10)) / 7)} ${monthName}`;
}
