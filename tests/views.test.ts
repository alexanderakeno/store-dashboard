import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES } from "@/config/business";
import { enrichSales, totals } from "@/lib/domain/kpi";
import { reconcile } from "@/lib/domain/reconcile";
import { validateRuleOverrides } from "@/lib/domain/rulesValidation";
import { shareText } from "@/lib/domain/share";
import { attachRate, conversion, dailyRows, focusView, homeView, staffView, weeklyView } from "@/lib/domain/views";
import { parseControlSheet } from "@/lib/parsers/controlSheet";
import { parseTargetStore } from "@/lib/parsers/targetStore";
import { generateMonth } from "@/lib/repositories/fixture/generate";
import { GROUPS } from "@/types/domain";

const MONTH = "2026-09";
const ASOF = "2026-09-20";

function month() {
  const g = generateMonth(MONTH, "2026-09-30");
  const control = parseControlSheet(g.control, MONTH);
  const target = parseTargetStore(g.target, MONTH);
  const lines = enrichSales(control.sales, control.merch, DEFAULT_RULES);
  const traffic = [{ date: "2026-09-01", traffic: 100 }, { date: "2026-09-02", traffic: 0 }];
  return { control, target, lines, input: { month: MONTH, lines, target, traffic, rules: DEFAULT_RULES } };
}

test("synthetic month passes the real parsers and every reconciliation check", () => {
  const { control, lines, target } = month();
  assert.ok(lines.length > 300);
  assert.equal(control.warnings.length, 0);
  assert.equal(control.daily.length, 30);
  assert.ok(target.total > 0 && target.staff.length === 5);
  const errors = reconcile(lines, control.merch).filter((i) => i.severity !== "info" && i.check !== "Invoice multi-staff");
  assert.deepEqual(errors, []);
  assert.equal(lines.filter((l) => l.qtySource === "uncertain").length, 0);
});

test("home view: groups add up, series = MTD, estimate & point consistent", () => {
  const { input } = month();
  const h = homeView(input, ASOF);
  const mtd = totals(input.lines.filter((l) => l.date <= ASOF));
  assert.equal(h.totals.sales, mtd.sales);
  assert.equal(h.groups.reduce((a, g) => a + g.actual, 0), h.totals.sales);
  assert.equal(h.series.length, 20);
  assert.equal(h.series.reduce((a, d) => a + d.sales, 0), h.totals.sales);
  assert.equal(Math.round(h.estimate), Math.round((h.totals.sales / 20) * 30));
  assert.ok(h.points.total <= h.points.max);
  assert.equal(h.daysElapsed, 20);
  assert.ok(shareText(h, "Demo").includes("Point"));
});

test("daily + weekly rows sum to MTD", () => {
  const { input } = month();
  const d = dailyRows(input, ASOF);
  const mtd = totals(input.lines.filter((l) => l.date <= ASOF));
  assert.equal(d.at(-1)!.cumSales, mtd.sales);
  const w = weeklyView(input, ASOF);
  assert.equal(w.reduce((a, x) => a + x.totals.sales, 0), mtd.sales);
  assert.equal(w.reduce((a, x) => a + x.days, 0), 30);
  assert.ok(Math.abs(w.reduce((a, x) => a + x.target, 0) - input.target.total) < 1);
});

test("staff view: staff + channel = store", () => {
  const { input } = month();
  const v = staffView(input, ASOF);
  const sum = [...v.staff, ...v.channels].reduce((a, s) => a + s.totals.sales, 0);
  assert.equal(sum, v.store.sales);
  assert.ok(v.channels.every((c) => c.isChannel));
  assert.ok(v.staff.every((s) => s.target > 0));
});

test("focus view: sections reconcile with group actuals (AirPods shown in Apple LOB, counted in ACC)", () => {
  const { input } = month();
  const h = homeView(input, ASOF);
  const f = focusView(input, ASOF);
  for (const g of GROUPS) {
    const s = f.find((x) => x.group === g)!;
    assert.equal(s.actual, h.groups.find((x) => x.group === g)!.actual, g);
  }
  const apple = f.find((x) => x.group === "Apple")!;
  assert.ok(apple.rows.some((r) => r.key === "AirPods" && r.actual > 0));
  const acc = f.find((x) => x.group === "ACC")!;
  assert.ok(acc.rows.some((r) => r.key === "Kaizen")); // supplier with target but no brand yet still listed
  assert.ok(acc.rows.find((r) => r.key === "Dino")!.actual > 0);
});

test("CVR uses only days with traffic; AR VAS = Qoala qty / device qty", () => {
  const { input } = month();
  const c = conversion(input.lines, input.traffic, "2026-09-01", ASOF);
  assert.equal(c.daysWithTraffic, 1);
  assert.equal(c.traffic, 100);
  const inv = new Set(input.lines.filter((l) => l.date === "2026-09-01").map((l) => l.invoice)).size;
  assert.equal(c.cvr, inv);
  const ar = attachRate(input.lines);
  assert.ok(ar.deviceQty > 0 && ar.vasQty > 0);
});

test("rule override validation", () => {
  assert.equal(validateRuleOverrides({ channelNames: ["MAPEMALL", "TOKOPEDIA"] }).ok, true);
  assert.equal(validateRuleOverrides({ pointCaps: { VAS: 12 } }).ok, true);
  assert.equal(validateRuleOverrides({ groupOverrides: [{ brand: "OPPO", group: "ACC" }] }).ok, true);
  assert.equal(validateRuleOverrides({ pointCaps: { Foo: 1 } }).ok, false);
  assert.equal(validateRuleOverrides({ groupOverrides: [{ brand: "X", group: "Nope" }] }).ok, false);
  assert.equal(validateRuleOverrides({ typo: 1 }).ok, false);
  assert.equal(validateRuleOverrides([]).ok, false);
  const r = validateRuleOverrides({ accSuppliers: { " zaag ": "Dino" } });
  assert.deepEqual(r.ok && r.value.accSuppliers, { ZAAG: "Dino" });
});
