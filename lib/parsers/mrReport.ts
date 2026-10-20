import type { MerchLine, MonthKey } from "@/types/domain";
import { normalizeKey, normalizeText, parseDate, parseNumber, splitProduct } from "@/lib/domain/normalize";

type Cell = string | number | boolean | null | undefined;

export interface MrReport {
  /** Months found in the item rows (normally exactly one). */
  months: MonthKey[];
  rows: MerchLine[];
  /** "Grand Total :" line of the report (null when missing). */
  grand: { qty: number; net: number } | null;
  /** Σ of the item rows — must equal `grand`. */
  sum: { qty: number; net: number };
  warnings: string[];
}

const t = (v: Cell) => normalizeText(v);

type Head = Pick<MerchLine, "brand" | "division" | "productGroup" | "category" | "date">;

/**
 * Merchandise Sales Report export (the same file as the MR part of "Import Raw"):
 * `Brand | Division | Group | Category | Date | "ARTICLE / Description" | Qty | Discount | Net`,
 * one "Total For <date>" line after each block and a "Grand Total :" line at the end.
 * Return lines leave Brand…Date empty — they belong to the row above, so those cells are
 * carried forward (otherwise the returns would be lost and totals would not match).
 */
export function parseMrReport(grid: Cell[][]): MrReport {
  const rows: MerchLine[] = [];
  const warnings: string[] = [];
  let grand: MrReport["grand"] = null;
  let prev: Head | null = null;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const first = t(row[0]);
    if (/^grand total/i.test(first)) {
      grand = { qty: parseNumber(row[1]), net: parseNumber(row[3]) };
      continue;
    }
    if (/^(total for|page\s*:|brand name)/i.test(first)) continue;
    const product = t(row[5]);
    if (!product) continue;
    const dateCell = row[4];
    const hasHead = [0, 1, 2, 3].some((c) => t(row[c])) || t(dateCell);
    let head: Head;
    if (hasHead) {
      const date = parseDate(dateCell, { slashOrder: "DMY" });
      if (!date) {
        warnings.push(`Baris ${r + 1}: tanggal tidak valid "${t(dateCell)}"`);
        continue;
      }
      head = { brand: normalizeKey(row[0]), division: normalizeKey(row[1]), productGroup: normalizeKey(row[2]), category: normalizeKey(row[3]), date };
    } else if (prev) {
      head = prev; // return line: same brand/category/date as the line above
    } else {
      warnings.push(`Baris ${r + 1}: baris tanpa brand/tanggal di awal file`);
      continue;
    }
    prev = head;
    const { article, description } = splitProduct(product);
    rows.push({ ...head, article, description, qty: parseNumber(row[6]), discount: parseNumber(row[7]), net: parseNumber(row[8]) });
  }
  const sum = rows.reduce((a, x) => ({ qty: a.qty + x.qty, net: a.net + x.net }), { qty: 0, net: 0 });
  if (!grand) warnings.push('Baris "Grand Total" tidak ditemukan — total tidak bisa dicocokkan.');
  else if (Math.abs(grand.net - sum.net) > 1 || Math.abs(grand.qty - sum.qty) > 0.01)
    warnings.push(`Total baris (${sum.qty} qty, ${Math.round(sum.net)}) tidak sama dengan Grand Total file (${grand.qty} qty, ${Math.round(grand.net)}).`);
  const months = [...new Set(rows.map((x) => x.date.slice(0, 7)))].sort();
  return { months, rows, grand, sum, warnings };
}
