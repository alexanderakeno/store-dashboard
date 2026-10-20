import type { IncentiveRules } from "@/config/business";
import type { SalesLine } from "@/types/domain";
import type { AccFocusBoard, AccFocusCell } from "@/types/extras";
import { displayName } from "./normalize";

/** Apple LOBs paid per unit, in display order. */
export const DEVICE_LOBS = ["Mac", "iPhone", "iPad", "Apple Watch"] as const;

/** No Qoala policy is priced in this band; any sale here is flagged so the scheme can be checked. */
const QOALA_GAP = { from: 1_500_000, to: 1_900_000 };

export interface QoalaTierCount {
  min: number;
  fee: number;
  policies: number;
}

export interface IncentiveRow {
  name: string;
  device: Record<string, { qty: number; fee: number }>;
  deviceFee: number;
  qoala: { policies: number; fee: number; tiers: QoalaTierCount[]; inGap: number };
  /** From the sheet's ACC Fokus leaderboard (null = staff not on the board). */
  acc: (AccFocusCell & { bySupplier: Record<string, AccFocusCell> }) | null;
  total: number;
}

export interface IncentiveView {
  rows: IncentiveRow[];
  total: { device: number; acc: number; qoala: number; all: number; policies: number };
  /** Qoala policies priced in the 1,5–1,9 jt band (not in the scheme). */
  qoalaInGap: number;
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
 * - Qoala: every policy is priced on its own (line amount ÷ policies on the line), gets its tier
 *   fee, then the fees are added up.
 * - Accessories: taken as-is from the sheet's "LEADERBOARD ACC FOKUS" (its own date, MTD).
 * `lines` must already be limited to the period; online channel lines are ignored.
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
        qoala: { policies: 0, fee: 0, tiers: tiers.map((t) => ({ ...t, policies: 0 })), inGap: 0 },
        acc: null,
        total: 0,
      };
      rows.set(k, r);
    }
    return r;
  };
  for (const n of staff) row(n);

  for (const l of lines) {
    if (l.isChannel || !l.staffName) continue;
    const rate = l.group === "Apple" && l.lob ? rules.perUnit[l.lob] : undefined;
    if (rate !== undefined && l.countsInQty) {
      const r = row(displayName(l.staffName));
      const d = (r.device[l.lob!] ??= { qty: 0, fee: 0 });
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
      if (price >= QOALA_GAP.from && price < QOALA_GAP.to) r.qoala.inGap += n;
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
    qoalaInGap: sum((r) => r.qoala.inGap),
  };
}
