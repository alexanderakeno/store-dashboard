import type { PriceItem, PriceKind } from "@/types/pricelist";

export type PriceChangeType = "naik" | "turun" | "baru" | "hilang" | "status" | "import";

/** One stored line of the price history (master sheet `APP_PriceHistory`). */
export interface PriceChange {
  /** Import time (ISO) — all lines of one import share it. */
  ts: string;
  kind: PriceKind;
  /** Price list date of the new / previous upload ("2026-10-19"). */
  date: string;
  prevDate: string;
  brand: string;
  series: string;
  name: string;
  change: PriceChangeType;
  oldNormal: number | null;
  newNormal: number | null;
  oldPromo: number | null;
  newPromo: number | null;
  oldCredit: number | null;
  newCredit: number | null;
  oldStatus: string;
  newStatus: string;
  by: string;
}

const key = (x: PriceItem) => `${x.kind}|${x.brand}|${x.series}|${x.name}`.toUpperCase().replace(/\s+/g, " ");

/** Same-name rows (e.g. a WiFi and a 5G "GALAXY TAB A11 4/64G") are paired in price order. */
function byKey(items: PriceItem[]): Map<string, PriceItem[]> {
  const m = new Map<string, PriceItem[]>();
  for (const x of items) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  for (const list of m.values()) list.sort((a, b) => a.normal - b.normal || a.promo - b.promo);
  return m;
}

/** The price a customer actually pays: promo (cash) price, else normal. */
const pays = (x: PriceItem) => (x.promo > 0 ? x.promo : x.normal);

/**
 * What changed between the stored price list and a new upload of the same kind(s): new and removed
 * types, price up / down (normal, promo or Apple installment price) and status changes (e.g. → EOL).
 * Always ends with one "import" line that records the upload itself (so uploads without changes show too).
 */
export function diffPrices(prev: PriceItem[], next: PriceItem[], meta: { ts: string; kind: PriceKind; date: string; prevDate: string; by: string }): PriceChange[] {
  const a = byKey(prev.filter((x) => x.kind === meta.kind));
  const b = byKey(next.filter((x) => x.kind === meta.kind));
  const out: PriceChange[] = [];
  const line = (o: PriceItem | undefined, n: PriceItem | undefined, change: PriceChangeType): PriceChange => {
    const x = (n ?? o)!;
    return {
      ts: meta.ts,
      kind: meta.kind,
      date: meta.date,
      prevDate: meta.prevDate,
      brand: x.brand,
      series: x.series,
      name: x.name,
      change,
      oldNormal: o?.normal ?? null,
      newNormal: n?.normal ?? null,
      oldPromo: o?.promo ?? null,
      newPromo: n?.promo ?? null,
      oldCredit: o?.credit ?? null,
      newCredit: n?.credit ?? null,
      oldStatus: o?.status ?? "",
      newStatus: n?.status ?? "",
      by: meta.by,
    };
  };
  for (const [k, nList] of b) {
    const oList = a.get(k) ?? [];
    nList.forEach((n, i) => {
      const o = oList[i];
      if (!o) return void out.push(line(undefined, n, "baru"));
      const moved = o.normal !== n.normal || o.promo !== n.promo || (o.credit ?? null) !== (n.credit ?? null);
      if (moved) out.push(line(o, n, pays(n) > pays(o) || (pays(n) === pays(o) && n.normal > o.normal) ? "naik" : "turun"));
      else if (o.status !== n.status) out.push(line(o, n, "status"));
    });
    oList.slice(nList.length).forEach((o) => out.push(line(o, undefined, "hilang")));
  }
  for (const [k, oList] of a) if (!b.has(k)) oList.forEach((o) => out.push(line(o, undefined, "hilang")));
  const order: Record<PriceChangeType, number> = { turun: 0, naik: 1, baru: 2, hilang: 3, status: 4, import: 5 };
  out.sort((x, y) => order[x.change] - order[y.change] || x.brand.localeCompare(y.brand) || x.name.localeCompare(y.name));
  out.push({
    ts: meta.ts, kind: meta.kind, date: meta.date, prevDate: meta.prevDate, brand: "", series: "",
    name: `${next.filter((x) => x.kind === meta.kind).length} tipe`, change: "import",
    oldNormal: null, newNormal: null, oldPromo: null, newPromo: null, oldCredit: null, newCredit: null, oldStatus: "", newStatus: "", by: meta.by,
  });
  return out;
}

export interface PriceUpdate {
  ts: string;
  kind: PriceKind;
  date: string;
  prevDate: string;
  by: string;
  /** "N tipe" of the import line. */
  size: string;
  changes: PriceChange[];
  count: Record<Exclude<PriceChangeType, "import">, number>;
}

/** History lines (any order) grouped per upload, newest upload first. */
export function groupUpdates(lines: PriceChange[]): PriceUpdate[] {
  const m = new Map<string, PriceUpdate>();
  for (const l of lines) {
    const k = `${l.ts}|${l.kind}`;
    let u = m.get(k);
    if (!u) m.set(k, (u = { ts: l.ts, kind: l.kind, date: l.date, prevDate: l.prevDate, by: l.by, size: "", changes: [], count: { naik: 0, turun: 0, baru: 0, hilang: 0, status: 0 } }));
    if (l.change === "import") u.size = l.name;
    else {
      u.changes.push(l);
      u.count[l.change]++;
    }
  }
  const order: Record<PriceChangeType, number> = { turun: 0, naik: 1, baru: 2, hilang: 3, status: 4, import: 5 };
  for (const u of m.values()) u.changes.sort((x, y) => order[x.change] - order[y.change] || x.brand.localeCompare(y.brand) || x.name.localeCompare(y.name));
  return [...m.values()].sort((a, b) => b.ts.localeCompare(a.ts));
}
