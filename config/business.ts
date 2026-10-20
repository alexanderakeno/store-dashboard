import type { Group } from "@/types/domain";

/**
 * Business defaults. Every value here can be overridden from the app's
 * Settings (stored in the master sheet) — this file only holds safe defaults,
 * never store identity or data.
 */
export interface BusinessRules {
  /** Raw brand → VAS provider display name. */
  vasBrands: Record<string, string>;
  /** brand|category → group overrides, applied after VAS detection. */
  groupOverrides: Array<{ brand: string; category?: string; type?: string; group: Group }>;
  /** Raw SP category → Apple LOB name. */
  appleLob: Record<string, string>;
  /** Raw brand → ACC supplier. */
  accSuppliers: Record<string, string>;
  /** Supplier display order (suppliers with no brand yet still appear). */
  supplierOrder: string[];
  /** Sales names that are channels, not staff. */
  channelNames: string[];
  /** Product types counted in Qty / UPT. */
  qtyTypes: string[];
  /** Point caps per group. */
  pointCaps: Record<Group, number>;
  /** Days before the closing estimate is considered stable. */
  estimateMinDays: number;
  /** Est. incentive scheme (accessories come from the sheet's ACC Fokus leaderboard). */
  incentive: IncentiveRules;
}

export interface IncentiveRules {
  /** Rupiah per unit sold, per Apple LOB (iPhone, iPad, Mac, Apple Watch). */
  perUnit: Record<string, number>;
  /** Qoala fee per policy by policy price: the highest tier whose `min` ≤ price applies. */
  qoalaTiers: Array<{ min: number; fee: number }>;
}

export const DEFAULT_RULES: BusinessRules = {
  vasBrands: { KOALA: "Qoala", QOALA: "Qoala", TELKOMSEL: "Telkomsel", XL: "XL", INDOSAT: "Indosat" },
  groupOverrides: [
    { brand: "SAMSUNG", category: "WATCH", type: "DEVICES", group: "ACC" },
    { brand: "XIAOMI", category: "WATCH", type: "DEVICES", group: "ACC" },
  ],
  appleLob: {
    PHONE: "iPhone",
    TABLETS: "iPad",
    LAPTOPS: "Mac",
    WATCH: "Apple Watch",
    EARPHONES: "AirPods",
  },
  accSuppliers: {
    MICROPACK: "Dino",
    "A.ELEMENTS": "Dino",
    ZAAG: "Dino",
    IBACKS: "iBack",
    RAPTIC: "IGA",
    MEDPOIN: "Medpoin",
    MUTURAL: "Mutual",
  },
  supplierOrder: ["Dino", "iBack", "IGA", "Medpoin", "Mutual", "Kaizen"],
  channelNames: ["MAPEMALL"],
  qtyTypes: ["DEVICES", "ACCESSORIES"],
  pointCaps: { Apple: 30, Android: 30, ACC: 30, VAS: 10 },
  estimateMinDays: 3,
  incentive: {
    perUnit: { Mac: 30_000, iPhone: 30_000, iPad: 30_000, "Apple Watch": 30_000 },
    qoalaTiers: [
      { min: 0, fee: 20_000 }, // below 1 jt
      { min: 1_000_000, fee: 40_000 }, // 1 jt – 1,5 jt (e.g. Emerald 1.315.000)
      { min: 1_500_000, fee: 60_000 }, // the "1,9–2 jt" tier: Tier 6 1.890.000, Diamond 1.970.000 (nothing is priced 1,5–1,85 jt)
      { min: 2_000_000, fee: 80_000 }, // 2 jt and up
    ],
  },
};
