import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES } from "@/config/business";
import { enrichSales, totals } from "@/lib/domain/kpi";
import { mtmView } from "@/lib/domain/mtm";
import { parseControlSheet } from "@/lib/parsers/controlSheet";
import { parseTargetStore } from "@/lib/parsers/targetStore";
import { generateMonth } from "@/lib/repositories/fixture/generate";

function input(month: string, last: string) {
  const g = generateMonth(month, last);
  const control = parseControlSheet(g.control, month);
  const target = parseTargetStore(g.target, month);
  return { month, lines: enrichSales(control.sales, control.merch, DEFAULT_RULES), target, traffic: [], rules: DEFAULT_RULES };
}

test("mtm compares the same day range in both months", () => {
  const oct = input("2026-10", "2026-10-13");
  const sep = input("2026-09", "2026-09-30");
  const v = mtmView(oct, "2026-10-13", sep);

  assert.equal(v.day, 13);
  assert.equal(v.base.to, "2026-10-13");
  assert.equal(v.compare.to, "2026-09-13");
  const sep13 = totals(sep.lines.filter((l) => l.date <= "2026-09-13"));
  assert.equal(v.compare.totals.sales, sep13.sales);
  assert.equal(v.compare.totals.invoices, sep13.invoices);
  // prorated target = monthly target × days ÷ days in month
  assert.equal(Math.round(v.compare.targetProrated), Math.round((sep.target.total * 13) / 30));
  assert.equal(Math.round(v.base.targetProrated), Math.round((oct.target.total * 13) / 31));
  // groups add up and growth matches
  assert.equal(v.groups.reduce((a, g) => a + g.compare, 0), v.compare.totals.sales);
  assert.equal(v.groups.reduce((a, g) => a + g.base, 0), v.base.totals.sales);
  assert.equal(v.growth.sales, ((v.base.totals.sales - v.compare.totals.sales) / v.compare.totals.sales) * 100);
  // staff rows add up to the store on both sides
  assert.equal(v.staff.reduce((a, s) => a + (s.base?.sales ?? 0), 0), v.base.totals.sales);
  assert.equal(v.staff.reduce((a, s) => a + (s.compare?.sales ?? 0), 0), v.compare.totals.sales);
});

test("mtm full-month block: compare month whole vs base closing estimate", () => {
  const oct = input("2026-10", "2026-10-13");
  const sep = input("2026-09", "2026-09-30");
  const v = mtmView(oct, "2026-10-13", sep);
  const total = v.full.find((r) => r.group === "Total")!;
  assert.equal(total.compareActual, totals(sep.lines).sales);
  const octMtd = totals(oct.lines).sales;
  assert.equal(Math.round(total.baseEstimate), Math.round((octMtd / 13) * 31));
  assert.equal(v.compareClosed, true);
});

test("mtm clips the day range to a shorter compare month", () => {
  const mar = input("2026-03", "2026-03-31");
  const feb = input("2026-02", "2026-02-28");
  const v = mtmView(mar, "2026-03-31", feb);
  assert.equal(v.compare.days, 28);
  assert.equal(v.compare.to, "2026-02-28");
  assert.equal(v.base.days, 31);
});
