import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePwpPromo, pwpRanges } from "../lib/parsers/pwpPromo";
import { daysLeft, endingSoon, pwpModel, pwpPrices, pwpView, variantPwp } from "../lib/domain/pwpPromo";
import type { PwpPromo } from "../types/pwpPromo";

const HEAD = ["Digiplus Article", "Description", "Current Price Cicilan/Cash ", "Digiplus Article", "Description", "Current Price Cicilan/Cash ", "Total harga Sebelum Cashback", "PWP Redmi Pad 2 Pro dengan Aksesoris", "Harga Setelah Cashback PWP", "BR"];
const pad = {
  name: "Redmi Pad 2 Pro",
  rows: [
    ["Promo PWP Redmi Pad 2 Pro dengan Aksesoris"],
    ["No. BR", "BR 88020 V11"],
    ["Periode ", "1 Oktober - 31 Desember 2026"],
    ["Redmi Pad 2 Pro", null, null, "Aksesoris"],
    HEAD,
    ["XMI1", "REDMI PAD 2 PRO 8/256GB GRAY", 4999000, "PEN1", "REDMI SMART PEN WHITE", 699000, 5698000, 200000, 5498000, "BR 88020 V11"],
    ["XMI1", "REDMI PAD 2 PRO 8/256GB GRAY", 4999000, "PEN2", "REDMI SMART PEN WHITE", 699000, 5698000, 200000, 5498000, "BR 88020 V11"],
    ["XMI2", "REDMI PAD 2 PRO 8/256GB SILVER", 5299000, "PEN1", "REDMI SMART PEN WHITE", 699000, 5998000, 200000, 5798000, "BR 88020 V11"],
    // bundle: pen (two codes) + keyboard on the following rows, BR with a MOP code
    ["XMI1", "REDMI PAD 2 PRO 8/256GB GRAY", 4999000, "PEN1", "REDMI SMART PEN WHITE", 699000, 6397000, 500000, 5897000, "BR 88020 V11\nMOP BTS: XIAOMI100"],
    [null, null, null, "PEN2", "REDMI SMART PEN WHITE", 699000, null, null, null, null],
    [null, null, null, "KB1", "REDMI PAD 2 PRO KEYBOARD", 699000, null, null, null, null],
  ],
};
// Batam columns are skipped; the cashback header is a formula result (the sheet title)
const tab = {
  name: "Xpad 30e",
  rows: [
    ["Promo PWP Infinix Tablet dengan Keyboard"],
    ["No. BR", "BR 91345 V7"],
    ["Periode ", "17 Juli 2026 - Further"],
    [],
    ["Digiplus Article", "Description", "Current Price Cicilan/Cash ", "Batam Current Price Cicilan/Cash ", "Digiplus Article", "Description", "Current Price Cicilan/Cash ", "Batam Current Price Cicilan/Cash ", "Total harga Sebelum Cashback", "Batam Total harga Sebelum Cashback", "Promo PWP Infinix Tablet dengan Keyboard", "Batam Promo PWP Infinix Tablet dengan Keyboard", "Harga Setelah Cashback PWP", "Batam Harga Setelah Cashback PWP", "BR"],
    ["IFX1", "INFINIX XPAD 30E 8/128GB BLUE", 2999000, 2849000, "KB9", "INFINIX XPAD 20 KEYBOARD", 499000, 449000, 3498000, 3298000, 100000, 100000, 3198000, 349000, "BR 91345 V7"],
  ],
};

test("pwp parser: offers, bundles, alternative codes, Batam columns, warnings", () => {
  const r = parsePwpPromo([pad, tab, { name: "Notes", rows: [["just text"]] }], { title: "PRICE LIST PROMO PWP DIGIPLUS 13 November 2026" });
  assert.equal(r.programs.length, 2);
  const p = r.programs[0];
  assert.deepEqual([p.id, p.brand, p.br], ["redmi-pad-2-pro", "Xiaomi", "BR 88020 V11"]);
  assert.deepEqual(p.ranges, [{ from: "2026-10-01", to: "2026-12-31" }]);
  assert.equal(p.devices.length, 2);
  assert.equal(p.offers.length, 2);
  assert.deepEqual(p.offers[0].items[0].articles, ["PEN1", "PEN2"]);
  assert.deepEqual(p.offers[0].devices, [0, 1]);
  const bundle = p.offers[1];
  assert.deepEqual(bundle.items.map((i) => [i.description, i.articles]), [["REDMI SMART PEN WHITE", ["PEN1", "PEN2"]], ["REDMI PAD 2 PRO KEYBOARD", ["KB1"]]]);
  assert.deepEqual([bundle.cashback, bundle.codes], [500000, ["XIAOMI100"]]);
  const x = r.programs[1];
  assert.deepEqual([x.brand, x.offers[0].cashback, x.devices[0].price, x.offers[0].items[0].price], ["Infinix", 100000, 2999000, 499000]);
  assert.deepEqual(x.ranges, [{ from: "2026-07-17", to: "2099-12-31" }]);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /Xpad 30e: 1 baris "Harga setelah cashback"/);
});

test("pwp periods", () => {
  assert.deepEqual(pwpRanges("1 November - 30 November 2026", 2026), [{ from: "2026-11-01", to: "2026-11-30" }]);
  assert.deepEqual(pwpRanges("4 November - 31 Desember 2026", 2026), [{ from: "2026-11-04", to: "2026-12-31" }]);
});

test("pwp view: price list wins, models fold colours, days left, ending soon", () => {
  const { programs } = parsePwpPromo([pad, tab], { title: "PWP 2026" });
  const promo: PwpPromo = { title: "", source: "", programs, warnings: [], updatedAt: "", updatedBy: "" };
  const prices = pwpPrices(
    [{ kind: "android", brand: "Xiaomi", series: "", name: "REDMI PAD 2 PRO 8/256GB", normal: 5299000, promo: 4799000, status: "ACTIVE", articles: ["XMI1"] }],
    [{ article: "KB1", brand: "Xiaomi", description: "KEYBOARD", category: "Keyboard", srp: 699000, current: 699000, price: 649000 }],
  );
  const v = pwpView(programs[0], prices, "2026-11-13");
  assert.deepEqual(v.models.map((m) => [m.name, m.price, m.listed, m.colors]), [["REDMI PAD 2 PRO 8/256GB", 4799000, true, ["GRAY"]], ["REDMI PAD 2 PRO 8/256GB", 5299000, false, ["SILVER"]]]);
  assert.deepEqual(v.mismatches, [{ name: "REDMI PAD 2 PRO 8/256GB", file: 4999000, list: 4799000 }]);
  assert.equal(v.offers[1].items[1].price, 649000);
  assert.deepEqual([v.state, v.end, v.daysLeft], ["aktif", "2026-12-31", 49]);
  assert.equal(daysLeft("2026-11-30", "2026-11-30"), 1);
  assert.equal(pwpView(programs[1], prices, "2026-11-13").daysLeft, null);
  assert.equal(pwpModel("INFINIX GT 50 PRO 12/512GB RED PUBG EDITION"), "INFINIX GT 50 PRO 12/512GB PUBG EDITION");
  const b = variantPwp(["XMI1"], promo, "2026-11-13", prices);
  assert.deepEqual([b.length, b[0].count, b[0].maxCashback, b[0].best?.nett], [1, 2, 500000, 499000]);
  assert.deepEqual(variantPwp(["NOPE"], promo, "2026-11-13", prices), []);
  assert.deepEqual(endingSoon(promo, "2026-12-20").map((x) => [x.id, x.daysLeft]), [["redmi-pad-2-pro", 12]]);
  assert.deepEqual(endingSoon(promo, "2026-11-13"), []);
});
