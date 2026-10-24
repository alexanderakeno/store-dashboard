/** Which Price List tab an item belongs to. */
export type PriceKind = "apple" | "android";

/** One row of the price list PDF (e.g. "GALAXY S26 12/256GB · 16.499.000 · 14.499.000 · ACTIVE"). */
export interface PriceItem {
  kind: PriceKind;
  /** Samsung, Huawei, Xiaomi, … / Apple. */
  brand: string;
  /** Section title printed above the rows ("GALAXY S SERIES"). */
  series: string;
  name: string;
  normal: number;
  /** Promotion price (equals `normal` when there is no promo). */
  promo: number;
  /** "ACTIVE", "EOL", … as printed in Product Remarks. */
  status: string;
  /** Apple only: "Promotion Cicilan Price" (installment); `promo` holds the cash price. */
  credit?: number;
  /** Apple: text in brackets after the description (colours, strap). Android Excel: promo remark / free gift. */
  note?: string;
  /** Android Excel price list: SAP articles (one per colour) — stock is matched on these codes. */
  articles?: string[];
}

/** Qoala protection fee per price tier and tenor. */
export interface QoalaTier {
  /** "KLABRONZE". */
  tier: string;
  /** "Rp 0 - Rp 3.000.000". */
  range: string;
  /** Fee per tenor in months: { "12": 200000, "18": 250000, "24": 280000 }. */
  fees: Record<string, number>;
}

/** Latest imported price list (master sheet `APP_PriceList`). Apple and Android are replaced independently. */
export interface PriceList {
  /** Price list date per kind ("PRICE LIST 19 OKTOBER 2026"). */
  dates: Partial<Record<PriceKind, string | null>>;
  items: PriceItem[];
  qoala: QoalaTier[];
  source: Partial<Record<PriceKind, string>>;
  updatedAt: Partial<Record<PriceKind, string>>;
}
