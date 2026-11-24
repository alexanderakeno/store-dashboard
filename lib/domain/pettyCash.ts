/**
 * Petty Cash Replenishment Summary (form QF10-style): accounts, row model and formatting.
 * Pure functions — shared by the page, the PDF builder and the AI extraction route.
 */

export const PC_ACCOUNTS = [
  { key: "transport", label: "Transport", code: "705100" },
  { key: "freight", label: "Freight", code: "705120" },
  { key: "stationery", label: "Stationery", code: "704110" },
  { key: "bank", label: "Bank Chg", code: "716100" },
  { key: "sundries", label: "Sundries", code: "715160" },
] as const;

export type PcAccount = (typeof PC_ACCOUNTS)[number]["key"];

export interface PcRow {
  id: string;
  date: string; // YYYY-MM-DD
  pcv: string;
  description: string;
  account: PcAccount;
  amount: number;
  /** id of the invoice page(s) this row comes from (attached to the PDF in row order) */
  pages: string[];
  /** the AI was not sure — highlighted for a check */
  uncertain?: boolean;
  /** why the row is highlighted (e.g. "beda bulan"), shown under the description; not printed */
  note?: string;
}

export interface PcHeader {
  storeName: string;
  storeCode: string;
  location: string;
  pcrsNo: string;
  fund: number;
  paymentRound: string;
  inProcess: string;
  preparedBy: string;
  approvedBy: string;
}

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function isAccount(v: unknown): v is PcAccount {
  return PC_ACCOUNTS.some((a) => a.key === v);
}

/** "Rp1.604.785" (format used on the form). */
export function rpForm(n: number): string {
  return `${n < 0 ? "-" : ""}Rp${Math.abs(Math.round(n)).toLocaleString("id-ID").replace(/,/g, ".")}`;
}

/** "500.000" */
export function numForm(n: number): string {
  return Math.round(n).toLocaleString("id-ID").replace(/,/g, ".");
}

/** "2026-10-02" → "02/10/2026" */
export function dmySlash(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** "2026-10-30" → "30-Okt" (the form's PCRS date). */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${d}-${MONTHS_SHORT[m - 1]}` : "";
}

/** "2026-10" → "Oktober" */
export function monthNameId(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return MONTHS_ID[m - 1] ?? "";
}

/** Rows sorted by date (stable), empty rows dropped. */
export function cleanRows(rows: PcRow[]): PcRow[] {
  return rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.description.trim() || r.amount)
    .sort((a, b) => (a.r.date || "9999").localeCompare(b.r.date || "9999") || a.i - b.i)
    .map(({ r }) => r);
}

export function totals(rows: PcRow[]): { byAccount: Record<PcAccount, number>; grand: number } {
  const byAccount = Object.fromEntries(PC_ACCOUNTS.map((a) => [a.key, 0])) as Record<PcAccount, number>;
  for (const r of rows) byAccount[r.account] += Math.round(r.amount) || 0;
  return { byAccount, grand: Object.values(byAccount).reduce((s, v) => s + v, 0) };
}

/** The month most rows fall in ("2026-10"), for the file name. */
export function mainMonth(rows: PcRow[], fallback: string): string {
  const c: Record<string, number> = {};
  for (const r of rows) if (/^\d{4}-\d{2}/.test(r.date)) c[r.date.slice(0, 7)] = (c[r.date.slice(0, 7)] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? fallback;
}

/** "Pettycash_QF10_Oktober_2026.pdf" */
export function fileName(storeCode: string, ym: string): string {
  const code = storeCode.replace(/[^A-Za-z0-9-]/g, "") || "STORE";
  return `Pettycash_${code}_${monthNameId(ym)}_${ym.slice(0, 4)}.pdf`;
}

/** What the extraction route returns for one page (or an error). */
export type PageRead = { error: string } | { isReceipt: boolean; date: string; description: string; amount: number; uncertain: boolean };

/**
 * Pages read in order → claim rows, like the QF10 form: one row per invoice, every row Sundries (715160)
 * — the store books all petty cash there; the account can still be changed by hand.
 * - a page that is not a receipt (blank / continuation without total) is attached to the previous row;
 * - a page with the same date and total as the previous row is another page of the same invoice
 *   (Shopee / Tokopedia invoices, a receipt photographed twice) and is attached, not counted twice.
 */
export function rowsFromPages(pages: Array<{ pageId: string; read: PageRead }>, newId: () => string): PcRow[] {
  const out: PcRow[] = [];
  for (const { pageId, read } of pages) {
    const prev = out[out.length - 1];
    if ("error" in read) {
      out.push({ id: newId(), date: "", pcv: "", description: "", account: "sundries", amount: 0, pages: [pageId], uncertain: true, note: "gagal dibaca" });
      continue;
    }
    if (prev && (!read.isReceipt || (read.amount > 0 && read.amount === prev.amount && read.date === prev.date))) {
      prev.pages.push(pageId);
      if (!prev.description && read.description) prev.description = read.description;
      continue;
    }
    // last page of a multi-page invoice: only the total, no date — completes the row started on the page before
    if (prev && !read.date && read.amount > 0 && !prev.amount && prev.date) {
      prev.pages.push(pageId);
      prev.amount = read.amount;
      if (!prev.description && read.description) prev.description = read.description;
      prev.uncertain = prev.uncertain || read.uncertain || undefined;
      continue;
    }
    out.push({ id: newId(), date: read.date, pcv: "", description: read.description, account: "sundries", amount: read.amount, pages: [pageId], uncertain: read.uncertain || undefined });
  }
  return out;
}

/**
 * Dates against the month most rows fall in:
 * - same month but another year (the AI misread "30-10-2026" as 2024) → the year is corrected;
 * - another month (an old receipt, e.g. September in the October claim) → highlighted "beda bulan", not dropped.
 */
export function flagOtherMonth(rows: PcRow[]): PcRow[] {
  const ym = mainMonth(rows, "");
  if (!ym) return rows;
  return rows.map((r) => {
    if (!r.date || r.date.slice(0, 7) === ym) return r;
    if (r.date.slice(5, 7) === ym.slice(5, 7)) return { ...r, date: `${ym.slice(0, 4)}${r.date.slice(4)}`, note: `tahun dikoreksi (terbaca ${r.date.slice(0, 4)})` };
    return { ...r, uncertain: true, note: `beda bulan (${dmySlash(r.date)})` };
  });
}

/** Normalizes one AI-extracted receipt into safe values (never trusts the model's types). */
export function normalizeExtract(raw: unknown): { isReceipt: boolean; date: string; description: string; account: PcAccount; amount: number; uncertain: boolean } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : "";
  const merchant = typeof o.merchant === "string" ? o.merchant.trim().slice(0, 40) : "";
  let items = typeof o.items === "string" ? o.items.trim().replace(/\s+/g, " ").slice(0, 90) : "";
  if (merchant && items && !items.toLowerCase().includes(`(${merchant.toLowerCase()})`)) items = `${items} (${merchant})`;
  else if (!items && merchant) items = merchant;
  const amt = typeof o.total === "number" ? o.total : Number(String(o.total ?? "").replace(/[^\d-]/g, ""));
  const amount = Number.isFinite(amt) && amt > 0 && amt < 1e10 ? Math.round(amt) : 0;
  return {
    isReceipt: o.isReceipt !== false,
    date,
    description: items,
    // the store books every petty cash line under Sundries (see the QF10 form); changeable by hand
    account: "sundries",
    amount,
    uncertain: o.confident === false || !date || !amount,
  };
}
