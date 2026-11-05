import type { IncentiveRules } from "@/config/business";
import type { SalesLine } from "@/types/domain";
import type { AccFocusBoard, AccFocusCell } from "@/types/extras";
import { displayName } from "./normalize";

/** Device columns paid per unit, in display order (Apple LOBs, then all Android devices together). */
export const DEVICE_LOBS = ["Mac", "iPhone", "iPad", "Apple Watch", "Android"] as const;

/** Android device unit that earns the Android rate (not one of the excluded products, e.g. Xiaomi / Motorola watches, Galaxy Fit 3). */
export function androidPaid(l: Pick<SalesLine, "group" | "lob" | "brand" | "description">, rules: IncentiveRules): boolean {
  if (l.group !== "Android") return false;
  const brand = `${l.lob ?? ""} ${l.brand}`.toUpperCase();
  return !(rules.android?.exclude ?? []).some((x) => {
    if (!brand.includes(x.brand.toUpperCase())) return false;
    try {
      return new RegExp(x.match, "i").test(l.description);
    } catch {
      return l.description.toUpperCase().includes(x.match.toUpperCase());
    }
  });
}

export interface QoalaTierCount {
  min: number;
  fee: number;
  policies: number;
}

export interface IncentiveRow {
  name: string;
  device: Record<string, { qty: number; fee: number }>;
  deviceFee: number;
  qoala: { policies: number; fee: number; tiers: QoalaTierCount[]; uncertain: number };
  /** From the sheet's ACC Fokus leaderboard (null = staff not on the board). */
  acc: (AccFocusCell & { bySupplier: Record<string, AccFocusCell> }) | null;
  total: number;
}

export interface IncentiveView {
  rows: IncentiveRow[];
  total: { device: number; acc: number; qoala: number; all: number; policies: number };
  /**
   * Qoala lines whose policy count could not be inferred from the MR prices: the per-policy
   * price (and so the tier) of these lines may be off.
   */
  qoalaUncertain: number;
}

/** Name key that survives case, apostrophe and spacing differences ("Elvina Qur'ani" = "ELVINA QUR'ANI"). */
export const nameKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/** Qoala fee for one policy priced `price` (highest tier whose min ≤ price). */
export function qoalaFee(price: number, tiers: IncentiveRules["qoalaTiers"]): number {
  let fee = 0;
  let best = -1;
  for (const t of tiers) if (price >= t.min && t.min > best) [best, fee] = [t.min, t.fee];
  return fee;
}

/**
 * Estimated incentive per staff:
 * - Apple devices: rupiah per unit (`perUnit`) × units sold; returns (negative qty) subtract.
 * - Android devices: `android.perUnit` per unit, except `android.exclude` (Xiaomi / Motorola watches, Galaxy Fit 3).
 * - Qoala: every policy is priced on its own (line amount ÷ policies on the line), gets its tier
 *   fee, then the fees are added up.
 * - Accessories: taken as-is from the sheet's "LEADERBOARD ACC FOKUS" (its own date, MTD).
 * - Online accounts (`online.accounts`, e.g. Digiplus.co.id, Mapemall): `online.perUnit` per Apple device only.
 * `lines` must already be limited to the period; other online channel lines are ignored.
 */
export function incentiveView(lines: SalesLine[], rules: IncentiveRules, acc: AccFocusBoard | null, staff: string[]): IncentiveView {
  const tiers = [...rules.qoalaTiers].sort((a, b) => a.min - b.min);
  const rows = new Map<string, IncentiveRow>();
  const row = (name: string) => {
    const k = nameKey(name);
    let r = rows.get(k);
    if (!r) {
      r = {
        name,
        device: Object.fromEntries(DEVICE_LOBS.map((l) => [l, { qty: 0, fee: 0 }])),
        deviceFee: 0,
        qoala: { policies: 0, fee: 0, tiers: tiers.map((t) => ({ ...t, policies: 0 })), uncertain: 0 },
        acc: null,
        total: 0,
      };
      rows.set(k, r);
    }
    return r;
  };
  for (const n of staff) row(n);

  // online accounts (Digiplus.co.id, Mapemall): flat rate per Apple device, nothing else
  const online = new Set((rules.online?.accounts ?? []).map(nameKey));
  for (const l of lines) {
    if (!l.staffName) continue;
    const isOnline = online.has(nameKey(l.staffName));
    if (l.isChannel && !isOnline) continue;
    const apple = l.group === "Apple" && l.lob ? rules.perUnit[l.lob] : undefined;
    // Android: one column for every brand; online accounts are paid on Apple devices only
    const android = !isOnline && l.type === "DEVICES" && rules.android && androidPaid(l, rules) ? rules.android.perUnit : undefined;
    const base = apple ?? android;
    const col = apple !== undefined ? l.lob! : "Android";
    const rate = apple !== undefined && isOnline ? (rules.online?.perUnit ?? 0) : base;
    if (isOnline && (apple === undefined || !l.countsInQty)) continue;
    if (rate !== undefined && l.countsInQty) {
      const r = row(displayName(l.staffName));
      const d = (r.device[col] ??= { qty: 0, fee: 0 });
      d.qty += l.qty;
      d.fee += l.qty * rate;
      continue;
    }
    if (l.vasProvider === "Qoala" && l.amount) {
      const r = row(displayName(l.staffName));
      const n = Math.max(1, Math.abs(l.qty || 1));
      const sign = l.amount < 0 ? -1 : 1;
      const price = Math.abs(l.amount) / n;
      const fee = qoalaFee(price, tiers);
      r.qoala.policies += sign * n;
      r.qoala.fee += sign * n * fee;
      const t = [...r.qoala.tiers].reverse().find((x) => price >= x.min);
      if (t) t.policies += sign * n;
      if (l.qtySource === "uncertain") r.qoala.uncertain++;
    }
  }

  for (const s of acc?.staff ?? []) {
    const r = row(rows.get(nameKey(s.name))?.name ?? displayName(s.name));
    r.acc = { ...s.total, bySupplier: s.bySupplier };
  }

  const out = [...rows.values()].map((r) => {
    r.deviceFee = Object.values(r.device).reduce((a, d) => a + d.fee, 0);
    r.total = r.deviceFee + r.qoala.fee + (r.acc?.fee ?? 0);
    return r;
  });
  out.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const sum = (f: (r: IncentiveRow) => number) => out.reduce((a, r) => a + f(r), 0);
  return {
    rows: out,
    total: {
      device: sum((r) => r.deviceFee),
      acc: sum((r) => r.acc?.fee ?? 0),
      qoala: sum((r) => r.qoala.fee),
      all: sum((r) => r.total),
      policies: sum((r) => r.qoala.policies),
    },
    qoalaUncertain: sum((r) => r.qoala.uncertain),
  };
}
