import type { ISODate } from "./domain";

/** One article line of the SOH export (Sales Dashboard V6 PDF, "Stock On Hand"). */
export interface SohItem {
  /** Column title in the PDF: iPhone, iPad, MacBook, Apple Watch, Samsung, Oppo, … */
  category: string;
  article: string;
  description: string;
  qty: number;
}

/** Latest imported stock on hand (master sheet `APP_SOH`) — one snapshot, replaced on every import. */
export interface SohSnapshot {
  /** "Date Updated" printed in the PDF. */
  date: ISODate | null;
  /** Category order as in the PDF. */
  categories: string[];
  items: SohItem[];
  /** PDF heading (store / report name) and file name, for display only. */
  source: string;
  updatedAt: string;
  updatedBy: string;
}
