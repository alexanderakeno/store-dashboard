import { GROUPS, type Group, type MonthKey, type StaffTarget, type StoreTarget, type TargetSection } from "@/types/domain";
import { normalizeText, parseNumber } from "@/lib/domain/normalize";
import type { Grid } from "./controlSheet";

const SECTION_TITLES: Record<string, Group> = {
  apple: "Apple",
  android: "Android",
  accessories: "ACC",
  accesories: "ACC",
  acc: "ACC",
  vas: "VAS",
};

const t = (v: unknown) => normalizeText(v);
const lower = (v: unknown) => t(v).toLowerCase();

function emptyGroups(): Record<Group, number> {
  return { Apple: 0, Android: 0, ACC: 0, VAS: 0 };
}

/**
 * Parse the `Target Store` tab by labels:
 * - `Total Target` header row → per-group totals on the next row
 * - sections titled Apple / Android / Accessories / VAS, each with
 *   `Target (IDR)` and a `Name | Target | …cols | Total` table of staff rows.
 */
export function parseTargetStore(grid: Grid, month: MonthKey): StoreTarget {
  const byGroup = emptyGroups();
  let total = 0;
  const brands: Record<string, number> = {};

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const c = row.findIndex((v) => lower(v) === "total target");
    if (c < 0) continue;
    const values = grid[r + 1] ?? [];
    total = parseNumber(values[c]);
    for (let k = c + 1; k < row.length; k++) {
      const g = SECTION_TITLES[lower(row[k])];
      if (g) {
        byGroup[g] = parseNumber(values[k]);
        continue;
      }
      // after the group columns the block lists the Android brand targets ("Samsung | Xiaomi | …")
      const label = t(row[k]);
      const v = parseNumber(values[k]);
      if (label && label !== "-" && /[a-z]/i.test(label) && v > 0) brands[label] = v;
    }
    break;
  }

  const sections: Partial<Record<Group, TargetSection>> = {};
  const staffMap = new Map<string, StaffTarget>();

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const titleCol = row.findIndex((v) => SECTION_TITLES[lower(v)] !== undefined);
    if (titleCol < 0) continue;
    // A section title is followed by a "Target (%)" row within 3 rows.
    const pctRow = [1, 2, 3].map((k) => r + k).find((k) => lower(grid[k]?.[titleCol]).startsWith("target (%"));
    if (pctRow === undefined) continue;
    const group = SECTION_TITLES[lower(row[titleCol])];
    const idrRow = grid[pctRow + 1] ?? [];
    const nameRowIdx = [2, 3].map((k) => pctRow + k).find((k) => lower(grid[k]?.[titleCol]) === "name");
    if (nameRowIdx === undefined) continue;
    const header = grid[nameRowIdx] ?? [];

    const columns: string[] = [];
    const colIdx: number[] = [];
    let totalCol = -1;
    for (let k = titleCol + 2; k < header.length; k++) {
      const label = t(header[k]);
      if (!label) continue;
      if (label.toLowerCase() === "total") { totalCol = k; break; }
      columns.push(label);
      colIdx.push(k);
    }
    const columnTargets: Record<string, number> = {};
    columns.forEach((col, i) => (columnTargets[col] = parseNumber(idrRow[colIdx[i]])));
    const sectionTotal = totalCol >= 0 ? parseNumber(idrRow[totalCol]) : Object.values(columnTargets).reduce((a, b) => a + b, 0);
    sections[group] = { group, columns, columnTargets, total: sectionTotal };

    let blankRun = 0;
    for (let s = nameRowIdx + 1; s < grid.length; s++) {
      const srow = grid[s] ?? [];
      const name = t(srow[titleCol]);
      // Skip empty placeholder rows (often hidden in the sheet) instead of
      // stopping; stop after a long blank run, at the Total row, or at the
      // next section title.
      if (!name) {
        if (++blankRun > 5) break;
        continue;
      }
      blankRun = 0;
      if (name.toLowerCase() === "total") break;
      if (SECTION_TITLES[name.toLowerCase()] !== undefined) break;
      const key = name.toLowerCase();
      const st = staffMap.get(key) ?? { name, sharePct: 0, byGroup: emptyGroups(), byColumn: {}, total: 0 };
      st.sharePct = Math.max(st.sharePct, parseNumber(srow[titleCol + 1]) / (t(srow[titleCol + 1]).includes("%") ? 100 : 1));
      columns.forEach((col, i) => (st.byColumn[`${group}:${col}`] = parseNumber(srow[colIdx[i]])));
      st.byGroup[group] = totalCol >= 0 ? parseNumber(srow[totalCol]) : columns.reduce((a, col) => a + st.byColumn[`${group}:${col}`], 0);
      st.total = GROUPS.reduce((a, g) => a + st.byGroup[g], 0);
      staffMap.set(key, st);
    }
    r = nameRowIdx;
  }

  // Fallback when the Total Target block is missing
  for (const g of GROUPS) if (!byGroup[g] && sections[g]) byGroup[g] = sections[g]!.total;
  if (!total) total = GROUPS.reduce((a, g) => a + byGroup[g], 0);

  return { month, total, byGroup, sections, staff: [...staffMap.values()], ...(Object.keys(brands).length ? { brands } : {}) };
}
