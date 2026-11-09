/** One article of the accessories price list ("Digimap / Digiplus Price … Update 8 November 2026"). */
export interface AccPriceItem {
  /** SAP article (trimmed, upper case) — joined with the SOH article. */
  article: string;
  brand: string;
  description: string;
  /** Case, Band, Charger, … as in the file. */
  category: string;
  /** "Reference SRP". */
  srp: number;
  /** "Current SRP Cash" — the price the POS had before this update. */
  current: number;
  /** Selling price now: "Repricing Cash" (falls back to current / SRP when empty). */
  price: number;
  /** "Promo November 2026", "repricing 6 Nov. 2026 s.d selamanya", … */
  remark?: string;
}

/** Latest imported accessories price list (master sheet `APP_AccPrice`), replaced whole on every import. */
export interface AccPriceList {
  date: string | null;
  source: string;
  items: AccPriceItem[];
  updatedAt: string;
  updatedBy: string;
}
