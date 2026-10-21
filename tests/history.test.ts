import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES } from "@/config/business";
import { historyLines } from "@/lib/domain/history";
import { totals } from "@/lib/domain/kpi";
import { lobQty, lobValue } from "@/lib/domain/extra";
import { parseMrReport } from "@/lib/parsers/mrReport";

// Layout of the "Merchandise Sales Report" export (Oktober 2025 sample), incl. return lines
// whose Brand…Date cells are empty and a blank brand on the first block.
const GRID = [
  ["Brand Name", "Product Division", "Product Group", "Product Category", null, null, null, null, null],
  [null, "HEALTH EQUIPMENT", "ACCESSORIES", "OTHER", "11-10-2025", "XXLAPPLE-GLD12 / MPD APPLE GOLD 12M", 2, 0, 1796000],
  ["Total For  11-10-2025", 2, 0, 1796000],
  ["APPLE", "HEALTH EQUIPMENT", "DEVICES", "PHONE", "02-10-2025", "APPMTP03ID/A / IPHONE 15 128GB BLACK", 3, 0, 37497000],
  [null, null, null, null, null, "APPMU1F3ID/A / IPHONE 15 PLUS 256GB BLUE", -1, 7500000, -14499000],
  ["Total For  02-10-2025", 2, 7500000, 22998000],
  ["APPLE", "HEALTH EQUIPMENT", "ACCESSORIES", "EARPHONES", "03-10-2025", "APPMXP63ID/A / AIRPODS PRO 3", 1, 0, 3999000],
  ["SAMSUNG", "HEALTH EQUIPMENT", "DEVICES", "PHONE", "04-10-2025", "SM-A175 / GALAXY A17 8/128GB BLACK", 2, 0, 6998000],
  ["KOALA", "HEALTH EQUIPMENT", "ACCESSORIES", "PROTECTION", "04-10-2025", "KLAGOLD(24-10) / PROTEKSI GOLD 24-10", 1, 0, 700000],
  ["Grand Total :", 8, 7500000, 36491000],
  ["Page :  1 of 1"],
];

test("parseMrReport: return lines inherit brand/date, totals match the Grand Total", () => {
  const r = parseMrReport(GRID);
  assert.deepEqual(r.months, ["2025-10"]);
  assert.equal(r.rows.length, 6);
  assert.deepEqual(r.sum, { qty: 8, net: 36491000 });
  assert.deepEqual(r.warnings, []);
  const ret = r.rows.find((x) => x.qty < 0)!;
  assert.deepEqual([ret.brand, ret.productGroup, ret.category, ret.date, ret.article], ["APPLE", "DEVICES", "PHONE", "2025-10-02", "APPMU1F3ID/A"]);
  assert.equal(r.rows[0].brand, ""); // first block has no brand
});

test("parseMrReport warns when rows don't add up to the Grand Total", () => {
  const bad = GRID.map((row) => (String(row[0]).startsWith("Grand") ? ["Grand Total :", 8, 0, 99] : row));
  assert.match(parseMrReport(bad).warnings.join(" "), /tidak sama dengan Grand Total/);
});

test("historyLines: MR lines classified like the current year (Apple LOB, Android brand, VAS)", () => {
  const lines = historyLines(parseMrReport(GRID).rows, DEFAULT_RULES);
  const t = totals(lines);
  assert.equal(t.sales, 36491000);
  assert.equal(t.byGroup.Apple, 37497000 - 14499000);
  assert.equal(t.byGroup.Android, 6998000);
  assert.equal(t.byGroup.VAS, 700000);
  assert.equal(lobQty(lines).iPhone, 2);
  assert.equal(lobValue(lines).AirPods, 3999000);
  assert.equal(lines.find((l) => l.brand === "SAMSUNG")?.lob, "Samsung");
});

test("sameRange: a running / cut-off month is compared with last year on the same days", async () => {
  const { sameRange, lastDay } = await import("@/lib/domain/history");
  const mk = (month: string, days: number[]) => historyLines(days.map((d) => ({ date: `${month}-${String(d).padStart(2, "0")}`, brand: "APPLE", division: "", productGroup: "DEVICES", category: "PHONE", article: "A", description: "D", qty: 1, discount: 0, net: 100 })), DEFAULT_RULES);
  const aug26 = mk("2026-08", [1, 10, 21]); // file ends on the 21st
  const aug25 = mk("2025-08", [1, 10, 21, 25, 31]); // complete month
  assert.equal(lastDay(aug26), 21);
  const r = sameRange("2026-08", "2025-08", aug26, aug25);
  assert.equal(r.upTo, 21);
  assert.equal(r.prev!.length, 3); // 25th and 31st left out
  assert.equal(r.cur!.length, 3);
  const full = sameRange("2026-07", "2025-07", mk("2026-07", [1, 31]), mk("2025-07", [2, 31]));
  assert.equal(full.upTo, null); // both complete → untouched
});
