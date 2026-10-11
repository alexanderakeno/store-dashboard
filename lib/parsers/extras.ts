import type { MonthKey, TrafficEntry } from "@/types/domain";
import type { PromoBrand, Tracker, TrackerDay } from "@/types/extras";
import { normalizeText, parseDate, parseNumber } from "@/lib/domain/normalize";
import type { Grid } from "./controlSheet";

const t = (v: unknown) => normalizeText(v);
const low = (v: unknown) => t(v).toLowerCase();

/**
 * `CX&GR Tracker`: side-by-side blocks titled e.g. "CX" / "GR". Each block has a
 * header row `Date | Day | <staff…> | Total … | Total Invoice | AR` followed by one
 * row per date (M/D/YYYY). Reading stops at the first row without a date.
 */
export function parseTracker(grid: Grid, month: MonthKey, title: string): Tracker | null {
  const want = title.toLowerCase();
  for (let r = 0; r < Math.min(grid.length, 6); r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (low(row[c]) !== want) continue;
      // header "Date" in the same column band, a few rows below
      for (let hr = r + 1; hr < Math.min(grid.length, r + 6); hr++) {
        const hrow = grid[hr] ?? [];
        const dc = [c, c - 1, c + 1, c - 2, c + 2].find((k) => k >= 0 && low(hrow[k]) === "date");
        if (dc === undefined) continue;
        return readTracker(grid, hr, dc, month, title);
      }
    }
  }
  return null;
}

function readTracker(grid: Grid, hr: number, dc: number, month: MonthKey, title: string): Tracker {
  const head = grid[hr] ?? [];
  const staffCols: Array<{ col: number; name: string }> = [];
  let totalCol = -1;
  let invCol = -1;
  for (let k = dc + 2; k < head.length; k++) {
    const h = low(head[k]);
    if (!h) continue;
    if (h.startsWith("total") && h.includes("invoice")) { invCol = k; break; }
    if (h.startsWith("total")) { totalCol = k; continue; }
    if (h === "ar") break;
    if (totalCol < 0) staffCols.push({ col: k, name: t(head[k]) });
  }
  const days: TrackerDay[] = [];
  for (let r = hr + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const date = parseDate(row[dc], { slashOrder: "MDY" });
    if (!date) break;
    if (!date.startsWith(month)) continue;
    const byStaff: Record<string, number> = {};
    for (const s of staffCols) byStaff[s.name] = parseNumber(row[s.col]);
    const sum = Object.values(byStaff).reduce((a, b) => a + b, 0);
    days.push({ date, byStaff, total: totalCol >= 0 ? parseNumber(row[totalCol]) || sum : sum, invoices: invCol >= 0 ? parseNumber(row[invCol]) : null });
  }
  return { title, staff: staffCols.map((s) => s.name), days };
}

/**
 * `Rekap Promo`: brand names on one row, under each a `Promo | Keterangan` pair,
 * then free-form rows. A row with only a note continues the previous promo.
 */
export function parsePromo(grid: Grid): PromoBrand[] {
  const out: PromoBrand[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length - 1; c++) {
      if (low(row[c]) !== "promo" || low(row[c + 1]) !== "keterangan") continue;
      const brand = t(grid[r - 1]?.[c]) || t(grid[r - 1]?.[c + 1]) || `Promo ${out.length + 1}`;
      const items: PromoBrand["items"] = [];
      let blank = 0;
      for (let s = r + 1; s < grid.length; s++) {
        const srow = grid[s] ?? [];
        if (low(srow[c]) === "promo" && low(srow[c + 1]) === "keterangan") break;
        // next brand header row (brand name directly above a Promo/Keterangan pair)
        if (low(grid[s + 1]?.[c]) === "promo" && low(grid[s + 1]?.[c + 1]) === "keterangan") break;
        const promo = t(srow[c]);
        const note = t(srow[c + 1]);
        if (!promo && !note) {
          if (++blank > 2) break;
          continue;
        }
        blank = 0;
        if (promo === "-" && !note) continue;
        if (!promo && items.length) items[items.length - 1].note = [items[items.length - 1].note, note].filter(Boolean).join(" · ");
        else items.push({ promo: promo === "-" ? note : promo, note: promo === "-" ? "" : note });
      }
      out.push({ brand, items });
    }
  }
  return out.filter((b) => b.items.length);
}

const ID_MONTH_NAMES = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];

/** `Traffic`: blocks `<Bulan> | Traffic | Invoice | CVR`, one row per day ("1 Oktober"). */
export function parseTrafficTab(grid: Grid, month: MonthKey): TrafficEntry[] {
  const name = ID_MONTH_NAMES[Number(month.slice(5, 7)) - 1];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length - 1; c++) {
      if (low(row[c]) !== name || low(row[c + 1]) !== "traffic") continue;
      const out: TrafficEntry[] = [];
      for (let s = r + 1; s < grid.length; s++) {
        const label = t(grid[s]?.[c]);
        const m = label.match(/^(\d{1,2})\b/);
        if (!m) {
          if (out.length) break;
          continue;
        }
        const day = Number(m[1]);
        const traffic = parseNumber(grid[s]?.[c + 1]);
        if (day >= 1 && day <= 31 && traffic > 0) out.push({ date: `${month}-${String(day).padStart(2, "0")}`, traffic: Math.round(traffic) });
      }
      return out;
    }
  }
  return [];
}
