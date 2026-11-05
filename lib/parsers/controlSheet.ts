import type { MerchLine, MonthKey, SalesLineRaw } from "@/types/domain";
import { normalizeInvoice, normalizeKey, normalizeNik, normalizeText, parseDate, parseNumber, splitProduct } from "@/lib/domain/normalize";

export type Cell = string | number | boolean | null | undefined;
export type Grid = Cell[][];

export interface ControlSheetData {
  merch: MerchLine[];
  sales: SalesLineRaw[];
  daily: Array<{ date: string; merchTotal: number; salesTotal: number; difference: number }>;
  skippedOtherMonth: number;
  warnings: string[];
}

const cellText = (c: Cell) => normalizeText(c);

function findHeader(grid: Grid, label: string, maxRows = 15): { row: number; col: number } | null {
  const target = label.toLowerCase();
  for (let r = 0; r < Math.min(grid.length, maxRows); r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) if (cellText(row[c]).toLowerCase() === target) return { row: r, col: c };
  }
  return null;
}

/**
 * Parse the `Control MR &SP` tab. Columns are located from the header labels
 * `Brand Name` (Merchandise Report) and `Sales Name` (Sales Person), so the
 * block can move without breaking the app. Rows outside `month` are skipped.
 */
export function parseControlSheet(grid: Grid, month: MonthKey): ControlSheetData {
  const warnings: string[] = [];
  const mrAnchor = findHeader(grid, "Brand Name");
  const spAnchor = findHeader(grid, "Sales Name");
  if (!mrAnchor) throw new Error("Header 'Brand Name' tidak ditemukan di sheet Control MR &SP");
  if (!spAnchor) throw new Error("Header 'Sales Name' tidak ditemukan di sheet Control MR &SP");

  const start = Math.max(mrAnchor.row, spAnchor.row) + 1;
  const merch: MerchLine[] = [];
  const sales: SalesLineRaw[] = [];
  const daily: ControlSheetData["daily"] = [];
  let skippedOtherMonth = 0;
  const M = mrAnchor.col;
  const S = spAnchor.col;
  const dailyCol = M - 5; // Date | MR | SP | Difference block left of the MR block

  for (let r = start; r < grid.length; r++) {
    const row = grid[r] ?? [];
    // a broken formula in the sheet (#REF!, #N/A, …) shows up as a fake staff / product: leave such rows out
    const broken = (cells: unknown[]) => cells.find((c) => isSheetError(c));

    // Daily control block
    if (dailyCol >= 0) {
      const d = parseDate(row[dailyCol]);
      if (d && d.startsWith(month)) {
        daily.push({ date: d, merchTotal: parseNumber(row[dailyCol + 1]), salesTotal: parseNumber(row[dailyCol + 2]), difference: parseNumber(row[dailyCol + 3]) });
      }
    }

    // Merchandise Report block
    const mrProduct = cellText(row[M + 5]);
    const mrBad = broken([row[M], row[M + 5]]);
    if (mrBad && parseNumber(row[M + 8]) === 0) warnings.push(`MR baris ${r + 1}: sel error di sheet (${String(mrBad).split(/\s/)[0]}), baris dilewati`);
    else if (cellText(row[M]) && mrProduct) {
      const date = parseDate(row[M + 4]);
      if (!date) warnings.push(`MR baris ${r + 1}: tanggal tidak valid "${cellText(row[M + 4])}"`);
      else if (!date.startsWith(month)) skippedOtherMonth++;
      else {
        const { article, description } = splitProduct(mrProduct);
        merch.push({
          date,
          brand: normalizeKey(row[M]),
          division: normalizeKey(row[M + 1]),
          productGroup: normalizeKey(row[M + 2]),
          category: normalizeKey(row[M + 3]),
          article,
          description,
          qty: parseNumber(row[M + 6]),
          discount: parseNumber(row[M + 7]),
          net: parseNumber(row[M + 8]),
        });
      }
    }

    // Sales Person block
    const spProduct = cellText(row[S + 1]);
    const spBad = broken([row[S], row[S + 1], row[S + 2]]);
    if (spBad && parseNumber(row[S + 3]) === 0) warnings.push(`SP baris ${r + 1}: sel error di sheet (${String(spBad).split(/\s/)[0]}), baris dilewati`);
    else if (spProduct && (cellText(row[S]) || cellText(row[S + 2]))) {
      const date = parseDate(row[S - 2]);
      if (!date) warnings.push(`SP baris ${r + 1}: tanggal tidak valid "${cellText(row[S - 2])}"`);
      else if (!date.startsWith(month)) skippedOtherMonth++;
      else {
        const { article, description } = splitProduct(spProduct);
        sales.push({
          date,
          nik: normalizeNik(row[S - 1]),
          // an error cell with a real amount keeps the sale (it still counts) without a fake staff name
          staffName: isSheetError(row[S]) ? "" : cellText(row[S]),
          article,
          description,
          invoice: normalizeInvoice(row[S + 2]),
          amount: parseNumber(row[S + 3]),
          type: normalizeKey(row[S + 4]),
          brand: normalizeKey(row[S + 5]),
          category: normalizeKey(row[S + 6]),
        });
      }
    }
  }
  return { merch, sales, daily, skippedOtherMonth, warnings };
}

/** Google Sheets error values: "#REF!", "#N/A", "#VALUE!", "#DIV/0!", "#NAME?", "#NUM!", "#NULL!", "#ERROR!", "#SPILL!" (with or without a message). */
export function isSheetError(v: unknown): boolean {
  return /^\s*#(REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|ERROR!|SPILL!)/i.test(String(v ?? ""));
}
