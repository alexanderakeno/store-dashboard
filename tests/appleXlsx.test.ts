import { test } from "node:test";
import assert from "node:assert/strict";
import { isApplePriceListXlsx, parseApplePriceListXlsx } from "@/lib/parsers/appleXlsx";
import type { Sheet } from "@/lib/parsers/androidXlsx";
import { priceModels } from "@/lib/domain/pricelist";
import type { SohItem } from "@/types/soh";

/** Synthetic workbook shaped like "PRICE LIST DIGIMAP 23 Oktober 2026 - Further Notice.xlsx". */
function workbook(): Sheet[] {
  const H = ["Infinite Article", "SAP Article", "SAPDescription", "Category", "", "Normal Price", "Promotion   Price", "Penurunan", "Remarks", "", "", "Promotion Cicilan Bundling", "Promotion Cash Bundling", "BR/ZOUT", "EOL Status"];
  const C = { mac: "Apple Device - Mac & Watch", iphone: "Apple Device - iPhone" };
  const row = (a: string, d: string, c: string, n: number, p: number, rem: string, eol = "") => ["", a, d, c, a.replace("/", "-"), n, p, p - n, rem, "", "", "", "", "", eol];
  return [
    {
      name: "PRICE LIST APPLE DEVICE",
      rows: [
        ["", "PT. MAP ZONA ADIPERKASA"],
        ["", "DIGIMAP PRICE LIST  23 Oktober 2026"],
        [],
        [],
        H,
        ["", "Macbook Air 2022"],
        row("APPMLXW3ID/A", "MBA 13.6 SPG/8C GPU/8GB/256GB-IND", C.mac, 19999000, 13299000, "Promo 29 September"),
        row("APPMLXY3ID/A", "MBA 13.6 SLV/8C GPU/8GB/256GB-IND", C.mac, 19999000, 13299000, "Promo 29 September"),
        [],
        ["", "iPhone 16 series"],
        row("APPMYE73ID/A", "IPHONE 16 PRO 256GB BLACK TITANIUM", C.iphone, 21749000, 17999000, "Promo Okt"),
        row("APPMYE83ID/A", "IPHONE 16 PRO 256GB WHITE TITANIUM", C.iphone, 21749000, 17999000, "Promo Okt"),
        row("APPMYMM3ID/A", "IPHONE 16 PRO MAX 512GB DESERT TITANIUM", C.iphone, 28249000, 21999000, "Promo Okt"),
        row("APPMYMN3ID/A", "IPHONE 16 PRO MAX 512GB WHITE TITANIUM", C.iphone, 28249000, 25999000, "Promo Okt"),
        row("APPMYMP3ID/A", "IPHONE 16 PRO MAX 512GB BLACK TITANIUM", C.iphone, 28249000, 21999000, "Promo Okt"),
        row("APPMYMQ3ID/A", "IPHONE 16 E 128GB BLACK", C.iphone, 12749000, 0, "", "EOL Status"),
      ],
    },
    { name: "Sheet2", rows: [["BR/ZOUT"]] },
  ];
}

test("apple excel: one row per type + price, colour removed, iPhone models split, articles kept", () => {
  const sheets = workbook();
  assert.equal(isApplePriceListXlsx(sheets), true);
  assert.equal(isApplePriceListXlsx([{ name: "MASTER", rows: [["Brand", "SAP Article"]] }]), false);
  const r = parseApplePriceListXlsx(sheets);
  assert.equal(r.date, "2026-10-23");
  assert.deepEqual(r.kinds, ["apple"]);
  assert.deepEqual(r.qoala, []);
  // iPhone first (category order), Mac after
  assert.deepEqual(r.items.map((x) => x.brand), ["iPhone", "iPhone", "iPhone", "iPhone", "Mac"]);
  const pro = r.items.find((x) => x.name === "iPhone 16 Pro 256GB")!;
  assert.equal(pro.series, "iPhone 16 Pro");
  assert.deepEqual(pro.articles, ["APPMYE73ID/A", "APPMYE83ID/A"]);
  assert.equal(pro.credit, undefined);
  assert.equal(pro.note, "Promo Okt");
  // the white Pro Max priced differently → its own row, colour shown in the note
  const max = r.items.filter((x) => x.name === "iPhone 16 Pro Max 512GB");
  assert.equal(max.length, 2);
  assert.deepEqual(max.find((x) => x.promo === 21999000)!.articles, ["APPMYMM3ID/A", "APPMYMP3ID/A"]);
  assert.match(max.find((x) => x.promo === 25999000)!.note ?? "", /^WHITE/);
  // single-colour type: colour learned from the other types; no promo price → normal price; EOL status
  const e = r.items.find((x) => x.articles?.[0] === "APPMYMQ3ID/A")!;
  assert.equal(e.name, "iPhone 16 E 128GB");
  assert.equal(e.promo, 12749000);
  assert.equal(e.status, "EOL");
  const mba = r.items.find((x) => x.brand === "Mac")!;
  assert.equal(mba.name, "MBA 13.6/8C GPU/8GB/256GB");
  assert.equal(mba.series, "MacBook Air 2022");
});

test("apple excel: price list shows only types in stock, colour from SOH description", () => {
  const r = parseApplePriceListXlsx(workbook());
  const soh = [
    { category: "iPhone", article: "APPMYE83ID/A", description: "IPHONE 16 PRO 256GB WHITE TITANIUM", qty: 2 },
    { category: "MacBook", article: "APPMLXW3ID/A", description: "MBA 13.6 SPG/8C GPU/8GB/256GB-IND", qty: 0 },
  ] as SohItem[];
  const models = priceModels(r.items, "apple", soh, { inStockOnly: true });
  assert.deepEqual(models.map((m) => m.model), ["iPhone 16 Pro"]);
  assert.deepEqual(models[0].variants[0].stock, [{ article: "APPMYE83ID/A", color: "WHITE TITANIUM", qty: 2 }]);
  // without the filter every type is listed (Apple path, not the Android one)
  assert.equal(priceModels(r.items, "apple", soh).reduce((a, m) => a + m.variants.length, 0), 5);
});

test("apple pdf rows: model without stock hidden; model with stock shows every storage", () => {
  const pdf = [
    { kind: "apple" as const, brand: "iPhone", series: "iPhone 17 Pro", name: "iPhone 17 Pro 256GB", normal: 2, promo: 1, credit: 2, status: "ACTIVE" },
    { kind: "apple" as const, brand: "iPhone", series: "iPhone 17 Pro", name: "iPhone 17 Pro 512GB", normal: 3, promo: 2, credit: 3, status: "ACTIVE" },
    { kind: "apple" as const, brand: "iPhone", series: "iPhone 17 Pro Max", name: "iPhone 17 Pro Max 256GB", normal: 4, promo: 3, credit: 4, status: "ACTIVE" },
  ];
  const soh = [{ category: "iPhone", article: "APPMG8G4ID/A", description: "IPHONE 17 PRO 256GB SILVER", qty: 1 }] as SohItem[];
  const shown = priceModels(pdf, "apple", soh, { inStockOnly: true });
  assert.deepEqual(shown.map((m) => m.model), ["iPhone 17 Pro"]);
  assert.deepEqual(shown[0].variants.map((v) => v.variant), ["256GB", "512GB"]);
  assert.deepEqual(shown[0].variants[1].stock, []); // 512GB listed for its price, no stock
  assert.equal(priceModels(pdf, "apple", soh).flatMap((m) => m.variants).length, 3);
});

test("always-shown models stay in the list without stock (iPad Pro M5)", async () => {
  const { alwaysShown } = await import("@/lib/domain/pricelist");
  const m5 = { kind: "apple" as const, brand: "iPad", series: "iPad Pro M5- 2026", name: "IPAD PRO 11-INCH M5 WI-FI 512GB", normal: 2, promo: 1, status: "ACTIVE", articles: ["APPX1"] };
  const m4 = { ...m5, series: "iPad Pro M4 (11\") - 6th Gen", name: "IPAD PRO 11 WIFI 512GB", articles: ["APPX2"] };
  const air = { ...m5, series: "iPad Air M4 (11\")", name: "IPAD AIR 11 WIFI 256GB M4", articles: ["APPX3"] };
  const mbp = { ...m5, brand: "Mac", series: "MacBook Pro M5 2026", name: "MBP 14/M5/10C/10C GPU/16GB/512GB", articles: ["APPX4"] };
  assert.equal(alwaysShown(m5, ["iPad Pro M5"]), true);
  assert.equal(alwaysShown(m4, ["iPad Pro M5"]), false);
  assert.equal(alwaysShown(air, ["iPad Pro M5"]), false);
  assert.equal(alwaysShown(mbp, ["iPad Pro M5"]), false);
  const shown = priceModels([m5, m4, air, mbp], "apple", [], { inStockOnly: true, alwaysShow: ["iPad Pro M5"] });
  assert.deepEqual(shown.flatMap((m) => m.variants.map((v) => v.name)), ["IPAD PRO 11-INCH M5 WI-FI 512GB"]);
});
