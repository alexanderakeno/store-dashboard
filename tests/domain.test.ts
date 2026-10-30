import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES } from "@/config/business";
import { normalizeInvoice, parseDate, parseNumber, splitProduct } from "@/lib/domain/normalize";
import { daysInMonth, weeksOfMonth } from "@/lib/domain/period";
import { buildPriceBook, inferQty } from "@/lib/domain/qty";
import { byStaff, enrichSales, estimateClosing, invoices, point, points, totals } from "@/lib/domain/kpi";
import { reconcile } from "@/lib/domain/reconcile";
import { parseControlSheet } from "@/lib/parsers/controlSheet";
import { parseTargetStore } from "@/lib/parsers/targetStore";
import { CONTROL_GRID, TARGET_GRID } from "./fixtures";

test("parseNumber handles id-ID formats", () => {
  assert.equal(parseNumber("4.850.000.000"), 4850000000);
  assert.equal(parseNumber("100.010.628,00"), 100010628);
  assert.equal(parseNumber("24.999.000,000"), 24999000);
  assert.equal(parseNumber("(123.299.270)"), -123299270);
  assert.equal(parseNumber("-Rp836.723.105"), -836723105);
  assert.equal(parseNumber("63,22%"), 63.22);
  assert.equal(parseNumber("  - "), 0);
  assert.equal(parseNumber("#REF!"), 0);
  assert.equal(parseNumber(17450), 17450);
  assert.equal(parseNumber("17.450"), 17450);
});

test("parseDate handles every sheet format", () => {
  assert.equal(parseDate("02-09-2026"), "2026-09-02");
  assert.equal(parseDate("1/Okt/26"), "2026-10-01");
  assert.equal(parseDate("30/Sep/26"), "2026-09-30");
  assert.equal(parseDate("9/1/2026"), "2026-09-01");
  assert.equal(parseDate("9/13/2026"), "2026-09-13");
  assert.equal(parseDate(46266), "2026-09-01");
  assert.equal(parseDate("31-02-2026"), null);
  assert.equal(parseDate(""), null);
});

test("invoice + product normalization", () => {
  assert.equal(normalizeInvoice("100.010.628,00"), "100010628");
  assert.equal(normalizeInvoice(100010628), "100010628");
  assert.deepEqual(splitProduct("APPMD3J4ZA/A / 20W USB-C POWER ADAPTER"), { article: "APPMD3J4ZA/A", description: "20W USB-C POWER ADAPTER" });
});

test("weeks are Sunday–Saturday, clipped to month", () => {
  const w = weeksOfMonth("2026-09"); // 1 Sep 2026 = Tuesday
  assert.deepEqual(w[0], { index: 1, label: "Week 1", start: "2026-09-01", end: "2026-09-05" });
  assert.equal(w[1].start, "2026-09-06");
  assert.equal(w[1].end, "2026-09-12");
  assert.equal(w.at(-1)!.end, "2026-09-30");
  assert.equal(daysInMonth("2026-02"), 28);
});

test("qty inference from unit prices", () => {
  const book = buildPriceBook([
    { date: "2026-10-01", brand: "X", division: "", productGroup: "ACCESSORIES", category: "", article: "A", description: "", qty: 2, discount: 0, net: 300000 },
    { date: "2026-10-01", brand: "X", division: "", productGroup: "ACCESSORIES", category: "", article: "A", description: "", qty: 1, discount: 0, net: 140000 },
  ]);
  assert.deepEqual(inferQty("A", 450000, book), { qty: 3, source: "exact" });
  assert.deepEqual(inferQty("A", 140000, book), { qty: 1, source: "exact" });
  assert.deepEqual(inferQty("A", 0, book), { qty: 1, source: "free" });
  assert.deepEqual(inferQty("A", -150000, book), { qty: -1, source: "exact" });
  assert.deepEqual(inferQty("A", 99000, book), { qty: 1, source: "uncertain" });
});

test("point formula matches sheet", () => {
  // Sept 2026 store numbers from the sheet's Data - Akeno block
  const m = "2026-09";
  assert.equal(Math.round(point(3675690000, 3066165028, m, 30)), 30);
  assert.equal(Math.floor(point(751172030, 1587895135, m, 30)), 14);
  assert.equal(Math.floor(point(151204341, 167412822, m, 30)), 27);
  assert.equal(point(70067500, 28527015, m, 10), 10);
  assert.equal(point(1, 0, m, 30), 0);
});

test("VAS point: 1 point per full 10% achievement, max 10", () => {
  const m = "2026-10";
  assert.equal(point(9, 100, m, 10, 10), 0); // 9%
  assert.equal(point(10, 100, m, 10, 10), 1); // 10%
  assert.equal(point(87, 100, m, 10, 10), 8); // 87%
  assert.equal(point(100, 100, m, 10, 10), 10);
  assert.equal(point(245, 100, m, 10, 10), 10); // capped
  assert.equal(point(70067500, 28527015, "2026-09", 10, 10), 10);
});

test("closing estimate", () => {
  const e = estimateClosing(100, "2026-09", "2026-09-10", 3);
  assert.equal(e.value, 300);
  assert.equal(e.stable, true);
  assert.equal(estimateClosing(100, "2026-09", "2026-09-01", 3).stable, false);
  assert.equal(estimateClosing(100, "2026-09", "2026-10-05", 3).value, 100);
});

test("control sheet → enriched lines → totals reconcile", () => {
  const data = parseControlSheet(CONTROL_GRID, "2026-10");
  assert.equal(data.skippedOtherMonth, 2);
  assert.equal(data.merch.length, 7);
  assert.equal(data.sales.length, 7);
  assert.equal(data.daily.length, 2);

  const lines = enrichSales(data.sales, data.merch, DEFAULT_RULES);
  const t = totals(lines);
  assert.equal(t.sales, 24999000 + 1599000 + 699000 + 598000 + 4000000 + 1800000);
  assert.equal(t.byGroup.Apple, 24999000);
  assert.equal(t.byGroup.Android, 4000000);
  assert.equal(t.byGroup.VAS, 699000);
  assert.equal(t.byGroup.ACC, 1599000 + 598000 + 1800000); // AirPods + case + Samsung watch override
  assert.equal(t.invoices, 3);
  // qty: iPhone 1 + AirPods 1 + Qoala 1 + case 2 + Galaxy 1 + watch 1 = 7 (bag excluded)
  assert.equal(t.qty, 7);
  assert.equal(t.upt!.toFixed(2), (7 / 3).toFixed(2));

  const airpods = lines.find((l) => l.article === "ART-AP1")!;
  assert.equal(airpods.group, "ACC");
  assert.equal(airpods.lob, "AirPods");
  const qoala = lines.find((l) => l.article === "ART-QO1")!;
  assert.equal(qoala.vasProvider, "Qoala");
  const kase = lines.find((l) => l.article === "ART-CS1")!;
  assert.equal(kase.supplier, "Dino");
  assert.equal(kase.qty, 2);
  const online = lines.find((l) => l.staffName === "Mapemall")!;
  assert.equal(online.isChannel, true);

  const inv = invoices(lines);
  assert.equal(inv.length, t.invoices);
  assert.equal(inv.reduce((a, i) => a + i.qty, 0), t.qty);
  assert.equal(inv.reduce((a, i) => a + i.value, 0), t.sales);

  const issues = reconcile(lines, data.merch).filter((i) => i.severity === "error");
  assert.deepEqual(issues, []);
});

test("target store parser + staff aggregation", () => {
  const target = parseTargetStore(TARGET_GRID, "2026-10");
  assert.equal(target.total, 1000000000);
  assert.deepEqual(target.byGroup, { Apple: 600000000, Android: 300000000, ACC: 60000000, VAS: 40000000 });
  assert.deepEqual(target.sections.Apple!.columns, ["iPhone", "Mac"]);
  assert.deepEqual(target.sections.ACC!.columns, ["Dino", "Apple"]);
  assert.equal(target.staff.length, 2);
  const a = target.staff.find((s) => s.name === "Staff A")!;
  assert.equal(a.total, 500000000);
  assert.equal(a.sharePct, 0.5);

  const data = parseControlSheet(CONTROL_GRID, "2026-10");
  const lines = enrichSales(data.sales, data.merch, DEFAULT_RULES);
  const { staff, channels } = byStaff(lines, target);
  assert.equal(staff.length, 2);
  assert.equal(channels.length, 1);
  assert.equal(channels[0].name, "Mapemall");
  const t = totals(lines);
  assert.equal(staff.reduce((s, r) => s + r.totals.sales, 0) + channels[0].totals.sales, t.sales);

  const p = points(t.byGroup, t.byGroup, target.byGroup, "2026-10", DEFAULT_RULES);
  assert.equal(p.max, 100);
  assert.ok(p.total <= 100);
});

test("target store: Android brand targets from the Total Target block (fallback to the Android section)", async () => {
  const { parseTargetStore } = await import("@/lib/parsers/targetStore");
  const grid = [
    ["QF10", "Target Store"],
    ["", "100%", "68%", "22%"],
    ["Total Target", "Apple", "Android", "Accessories", "VAS", "", "Samsung", "Xiaomi", "Huawei", "Oppo"],
    [1000, 600, 300, 60, 40, "-", "150.000.000", 80, 40, 30],
  ];
  const t = parseTargetStore(grid, "2026-10");
  assert.equal(t.byGroup.Android, 300);
  assert.deepEqual(t.brands, { Samsung: 150000000, Xiaomi: 80, Huawei: 40, Oppo: 30 });
  // no brand columns → no `brands`, the Android section is used instead
  assert.equal(parseTargetStore(grid.map((r) => r.slice(0, 5)), "2026-10").brands, undefined);
});

test("staff target per Android brand follows the Total Target brand split", async () => {
  const { staffItemTarget } = await import("@/lib/domain/targets");
  const base = { month: "2026-10", total: 0, byGroup: { Apple: 0, Android: 300, ACC: 0, VAS: 0 }, sections: { Android: { group: "Android" as const, columns: ["Samsung", "Oppo"], columnTargets: { Samsung: 200, Oppo: 100 }, total: 300 } } };
  const staff = [
    { name: "Ana", sharePct: 0.5, byGroup: { Apple: 0, Android: 150, ACC: 0, VAS: 0 }, byColumn: { "Android:Samsung": 100, "Android:Oppo": 50 }, total: 150 },
    { name: "Budi", sharePct: 0.5, byGroup: { Apple: 0, Android: 150, ACC: 0, VAS: 0 }, byColumn: { "Android:Samsung": 100, "Android:Oppo": 50 }, total: 150 },
  ];
  // brand block 240 / 60 → each staff's Android target split 80% / 20%; the staff sum equals the store brand target
  const t = { ...base, staff, brands: { Samsung: 240, Oppo: 60 } };
  assert.equal(staffItemTarget(t, "ana", "Android", "SAMSUNG"), 120);
  assert.equal(staffItemTarget(t, "Ana", "Android", "Oppo") + staffItemTarget(t, "Budi", "Android", "Oppo"), 60);
  assert.equal(staffItemTarget(t, "Ana", "Android", "Vivo"), 0);
  // without the brand block the section column is used
  assert.equal(staffItemTarget({ ...base, staff }, "Ana", "Android", "Samsung"), 100);
  assert.equal(staffItemTarget({ ...base, staff }, "Nobody", "Android", "Samsung"), 0);
});
