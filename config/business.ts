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
};
