import type { ISODate } from "./domain";

/** Kind of an article-level Samsung promo (one detail sheet of the promo workbook). */
export type PromoKind = "PWP" | "TRADE IN" | "TAMBAHAN TRADE IN" | "EIP" | "LAIN";

/** A date range a promo runs (inclusive). A promo may have several (e.g. weekends only). */
export interface PromoRange {
  from: ISODate;
  to: ISODate;
}

/** One row of the summary sheet "List Promo Samsung". */
export interface PromoProgram {
  no: number;
  /** "PWP", "TRADE IN", "CASHBACK di ETP", … as written. */
  type: string;
  name: string;
  mechanism: string;
  period: string;
  ranges: PromoRange[];
  /** "Ketentuan penggabungan promo" text. */
  combine: string;
  /** Store codes the promo is limited to (e.g. QA05, QA06); empty = all stores. */
  stores: string[];
  /** Promo codes (MOP SSC) mentioned in the mechanism. */
  codes: string[];
}

/** One article of a detail sheet: cashback value and promo code for that article. */
export interface PromoArticle {
  sheet: string;
  kind: PromoKind;
  article: string;
  description: string;
  value: number;
  code: string;
  /** Normal price printed in the sheet (foldables), else null. */
  normal: number | null;
  ranges: PromoRange[];
  /** Stores the promo is limited to (from the summary sheet); empty = all stores. */
  stores: string[];
}

/** An item that may be bought as the PWP pair of the devices of a sheet. */
export interface PromoPair {
  sheet: string;
  article: string;
  description: string;
}

/** Text of a detail sheet (title + terms), in reading order. */
export interface PromoSheet {
  name: string;
  kind: PromoKind;
  /** Summary-sheet row of this promo (null when no code links them). */
  program: number | null;
  ranges: PromoRange[];
  notes: string[];
}

/** Imported Samsung promo workbook (master sheet `APP_SamsungPromo`), replaced on every import. */
export interface SamsungPromo {
  title: string;
  programs: PromoProgram[];
  articles: PromoArticle[];
  pairs: PromoPair[];
  sheets: PromoSheet[];
  /** Differences between the summary sheet and the detail sheets (the detail sheets win). */
  warnings: string[];
  source: string;
  updatedAt: string;
  updatedBy: string;
}
