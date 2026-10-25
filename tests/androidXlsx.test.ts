import { test } from "node:test";
import assert from "node:assert/strict";
import { isAndroidPriceListXlsx, parseAndroidPriceListXlsx, type Sheet } from "@/lib/parsers/androidXlsx";
import { priceModels } from "@/lib/domain/pricelist";
import type { SohItem } from "@/types/soh";

/** Synthetic workbook shaped like "PRICE LIST PROMO DIGIPLUS … .xlsx". */
function workbook(): Sheet[] {
  const H = ["BRAND", "ARTICLE DIGIPLUS", "PRODUCT DESCRIPTION", "CATEGORY", "TYPE", "ORIGINAL PRICE CICILAN/CASH", "CURRENT PRICE CICILAN/CASH", "Penurunan/Kenaikan Harga", "Pricing Remarks", "ZOUT/BR No.", "Free Gift", "Product Remarks"];
  const row = (b: string, a: string, d: string, c: string, t: string, o: number, cur: number, rem: string | number, st: string | number) => [b, a, d, c, t, o, cur, cur - o, rem, 0, 0, st];
  return [
    {
      name: "MASTER",
      rows: [
        ["PT. DIGIPLUS RITEL ADIPERKASA - DIGIPLUS"],
        ["DIGIPLUS PRICE LIST 24 OKTOBER 2026 - FURTHER NOTICE"],
        [],
        ["Brand", "SAP Article", "SAP Description", "Category"],
        ["XIAOMI", "REDMI 17 series"],
        ["XIAOMI", "XMI1", "REDMI 17 4/128GB BLACK", "PHONE"],
        ["XIAOMI", "XMI2", "REDMI 17 4/128GB BLUE", "PHONE"],
        ["XIAOMI", "XMI3", "REDMI 17 6/128GB BLACK", "PHONE"],
        ["XIAOMI", "XIAOMI 15 series"],
        ["XIAOMI", "XMI9", "XIAOMI 15 12/512GB BLACK", "PHONE"],
        ["SAMSUNG", "SAMSUNG GALAXY A07 series"],
        ["SAMSUNG", "SSU1", "GALAXY A07 4/64GB BLACK", "PHONE"],
      ],
    },
    {
      name: "PRICE LIST DIGIPLUS NASIONAL",
      rows: [
        ["DIGIPLUS PRICE LIST 24 OKTOBER 2026 - FURTHER NOTICE"],
        H,
        row("XIAOMI", "XMI1", "REDMI 17 4/128GB BLACK", "PHONE", "REDMI 17 4/128GB", 2899000, 2799000, "Promo Cashback Rp 100.000 (16 Oktober - 31 Oktober 2026)", "ACTIVE"),
        row("XIAOMI", "XMI2", "REDMI 17 4/128GB BLUE", "PHONE", "REDMI 17 4/128GB ", 2899000, 2799000, "Promo Cashback Rp 100.000 (16 Oktober - 31 Oktober 2026)", "ACTIVE"),
        row("XIAOMI", "XMI3", "REDMI 17 6/128GB BLACK", "PHONE", "REDMI 17 6/128GB", 3299000, 3299000, 0, 0),
        row("XIAOMI", "XMI9", "XIAOMI 15 12/512GB BLACK", "PHONE", "XIAOMI 15 12/512GB", 9999000, 9999000, 0, "EOL"),
        row("SAMSUNG", "SSU1", "GALAXY A07 4/64GB BLACK", "PHONE", "GALAXY A07 4/64GB", 2499000, 2299000, "", "ACTIVE"),
      ],
    },
    // regional prices must be ignored
    { name: "PRICE LIST DIGIPLUS STORE BATAM", rows: [["DIGIPLUS PRICE LIST 24 OKTOBER 2026 - FURTHER NOTICE BATAM AREA"], H, row("XIAOMI", "XMI1", "REDMI 17 4/128GB BLACK", "PHONE", "REDMI 17 4/128GB", 1, 1, 0, "ACTIVE")] },
    { name: "PRICELIST PROMO QF10", rows: [["PT"], ["PRICE LIST HUAWEI QF10"], [], ["Article", "Description", "Current Price", "Promo Price", "Free Gift"], ["SSU1", "GALAXY A07 4/64GB BLACK", 2299000, 2199000, "Free Buds"]] },
    { name: "PRICELIST PROMO QA05 & QA06", rows: [["PT"], ["X"], [], ["Article", "Description", "Current Price", "Promo Price"], ["XMI3", "REDMI 17 6/128GB BLACK", 3299000, 1000]] },
    { name: "MKT COUPON TSEL", rows: [["PT"], ["COUPON"], ["BR No."], [], ["BRAND", "ARTICLE", "DESCRIPTION", "CURRENT PRICE CICILAN/CASH", "PROMO PRICE", "CASHBACK"], ["XIAOMI", "XMI3", "REDMI 17 6/128GB BLACK", 3299000, 3199000, -100000]] },
  ];
}

test("android excel: one row per type + price, articles kept, series from MASTER, store promo & coupon", () => {
  const sheets = workbook();
  assert.equal(isAndroidPriceListXlsx(sheets), true);
  assert.equal(isAndroidPriceListXlsx([{ name: "Sheet1", rows: [] }]), false);
  const r = parseAndroidPriceListXlsx(sheets, "QF10");
  assert.equal(r.date, "2026-10-24");
  assert.deepEqual(r.kinds, ["android"]);
  assert.equal(r.items.length, 4);
  const a = r.items.find((x) => x.name === "REDMI 17 4/128GB")!;
  assert.deepEqual(a.articles, ["XMI1", "XMI2"]);
  assert.equal(a.series, "REDMI 17 SERIES");
  assert.equal(a.brand, "Xiaomi");
  assert.equal(a.promo, 2799000);
  assert.match(a.note ?? "", /Cashback Rp 100\.000/);
  const b = r.items.find((x) => x.name === "REDMI 17 6/128GB")!;
  assert.equal(b.status, "ACTIVE"); // "0" in Product Remarks
  assert.equal(b.promo, 3299000); // the QA05/QA06 promo is another store's
  assert.match(b.note ?? "", /Kupon Telkomsel: Rp 3\.199\.000/);
  assert.equal(r.items.find((x) => x.name === "XIAOMI 15 12/512GB")!.series, "XIAOMI 15 SERIES");
  const s = r.items.find((x) => x.brand === "Samsung")!;
  assert.equal(s.series, "GALAXY A07 SERIES");
  assert.equal(s.promo, 2199000); // QF10 store promo
  assert.match(s.note ?? "", /Promo toko QF10 · Free Buds/);
});

test("android excel: price list shows only types with stock (by article code)", () => {
  const r = parseAndroidPriceListXlsx(workbook(), "QF10");
  const soh = [
    { category: "Xiaomi", article: "XMI2", description: "REDMI 17 4/128GB BLUE", qty: 3 },
    { category: "Xiaomi", article: "XMI3", description: "REDMI 17 6/128GB BLACK", qty: 0 },
  ] as SohItem[];
  const inStock = priceModels(r.items, "android", soh, { inStockOnly: true });
  // REDMI 17 has stock (4/128GB) → shown with ALL its storages; XIAOMI 15 and GALAXY A07 have none → hidden
  assert.deepEqual(inStock.flatMap((m) => m.variants.map((v) => v.name)), ["REDMI 17 4/128GB", "REDMI 17 6/128GB"]);
  assert.deepEqual(inStock[0].variants[0].stock, [{ article: "XMI2", color: "BLUE", qty: 3 }]);
  // without the filter every type is listed
  assert.equal(priceModels(r.items, "android", soh).flatMap((m) => m.variants).length, 4);
  // PDF rows (no articles) are never hidden
  const pdf = [{ kind: "android" as const, brand: "Oppo", series: "A6", name: "OPPO A6 6/128GB", normal: 1, promo: 1, status: "ACTIVE" }];
  assert.equal(priceModels(pdf, "android", soh, { inStockOnly: true }).length, 1);
});
