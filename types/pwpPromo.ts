import type { PromoRange } from "./samsungPromo";

/** A device of a PWP program, with the price printed in the file. */
export interface PwpDevice {
  article: string;
  description: string;
  /** "Current Price Cicilan/Cash" in the file (the price list wins when it has the article). */
  price: number;
}

/** One part of a PWP pair: interchangeable articles of the same item (e.g. two codes of one pen). */
export interface PwpItem {
  articles: string[];
  description: string;
  price: number;
}

/** What may be bought with the devices `devices` (indexes into the program's devices) and its cashback. */
export interface PwpOffer {
  /** One item, or several bought together (bundle). */
  items: PwpItem[];
  cashback: number;
  /** BR numbers / MOP codes of this offer. */
  br: string;
  codes: string[];
  devices: number[];
}

/** One sheet of the PWP workbook. */
export interface PwpProgram {
  id: string;
  sheet: string;
  title: string;
  brand: string;
  br: string;
  period: string;
  ranges: PromoRange[];
  devices: PwpDevice[];
  offers: PwpOffer[];
}

/** Imported PWP workbook (master tab `APP_PwpPromo`), replaced on every import. */
export interface PwpPromo {
  title: string;
  source: string;
  programs: PwpProgram[];
  /** Rows of the file whose own sums do not add up (shown to the admin, prices recomputed anyway). */
  warnings: string[];
  updatedAt: string;
  updatedBy: string;
}
