/**
 * DRA (weekly stock & sales report of the whole network — "MZA DRA Y27Q1W8 as of …xlsx"), packed small:
 * every article and store once, then one flat number list of store × article lines.
 */
export interface DraPack {
  /** e.g. "Y27Q1W8" (from the file name; "" when not found). */
  week: string;
  /** Data date from the file name ("as of minggu 22 nov 2026"), null when not found. */
  asOf: string | null;
  /** File name, for display. */
  source: string;
  /** Stores as "CODE Name", e.g. "QF10 Digiplus Kota Kasablanka". */
  sites: string[];
  /** [article, description, sub-LOB, brand, kind] — kind 0 = Apple, 1 = Android. */
  arts: Array<[string, string, string, string, 0 | 1]>;
  /** Flat [siteIndex, articleIndex, salesQty, stockOnHand, …]; siteIndex −1 = network total only (Apple accessories). */
  rows: number[];
}

export interface DraSnapshot extends DraPack {
  updatedAt: string;
  updatedBy: string;
}

/** Limits checked on upload (the real file: ~250 stores, ~3k articles, ~31k non-zero lines). */
export const DRA_LIMITS = { sites: 2_000, arts: 20_000, lines: 200_000 } as const;
