import { test } from "node:test";
import assert from "node:assert/strict";
import { isSohXlsx, parseSohXlsx } from "@/lib/parsers/sohXlsx";
import { matchArticles } from "@/lib/domain/pricelist";

/** Grid shaped like stockpositionreportdetail.xls (Sheet1, no column header row). */
function grid(grand = 9): unknown[][] {
  const row = (brand: string, group: string, cat: string, text: string, qty: number | string) => [brand, "HEALTH EQUIPMENT", group, cat, text, "1950", 1000, qty, 1000];
  return [
    ["PT. MITRA ADIPERKASA Tbk", "Store :", "Digiplus Kota Kasablanka", "User :", "Date :", 46320, "Time :", 36494.38, "Stock Position Report For 25-10-2026"],
    [null, null, null, null, null, null, null, null, null],
    row("A.ELEMENTS", "ACCESSORIES", "CHARGER", "AMNAPAADL65EUWH / AEL WALL CHARGER WITH USB C GAN 65W", 2),
    row("APPLE", "DEVICES", "PHONE", "APPMFYM4ID/A / IPHONE 17 PRO MAX 256GB SILVER", 0),
    row("APPLE", "DEVICES", "PHONE", "APPMFYM4ID/A / IPHONE 17 PRO MAX 256GB SILVER", 0),
    row("APPLE", "DEVICES", "PHONE", "APPMG2L4ID/A / IPHONE AIR 256GB SPACE BLACK", 1),
    row("APPLE", "DEVICES", "PHONE", "APPMG2L4ID/A / IPHONE AIR 256GB SPACE BLACK", 1),
    row("APPLE", "DEVICES", "LAPTOPS", "APPMDV94ID/A / MBA 15.3 SLV/M5/10C GPU/16GB/512GB-IND", 1),
    row("SAMSUNG", "DEVICES", "WATCH", "SSUSMR930 / GALAXY WATCH8 40MM SILVER", 1),
    row("XIAOMI", "SMART HOME", "TV", "XMI63852 / XIAOMI TV A 43F 2026", 1),
    row("APPLE", "DEMO", "PHONE", "APPMG2L4ID/A-D / IPHONE AIR 256GB SPACE BLACK DEMO", 1),
    row("Non MD", "MERCHANDISE", "PROMOTION", "ZZZBTS250K / BTS DISC 250RB", 1),
    ["Grand Total For Stock Quantity & Value", grand, 9000, "Average Selling Price", 1000, "", "", "", ""],
    [1],
  ];
}

test("soh excel: every line = 1 unit (Qty 0 included), Qty > 1 kept, categories, demo/merchandise skipped, date", () => {
  const g = grid();
  assert.equal(isSohXlsx(g), true);
  assert.equal(isSohXlsx([["Brand", "SAP Article"]]), false);
  const r = parseSohXlsx(g);
  assert.equal(r.date, "2026-10-25");
  assert.match(r.title, /Stock Position Report For 25-10-2026 · Digiplus Kota Kasablanka/);
  assert.deepEqual(r.categories, ["iPhone", "MacBook", "Samsung", "Aksesoris", "Elektronik"]);
  assert.equal(r.items.find((x) => x.article === "APPMFYM4ID/A")!.qty, 2); // 2 lines with Qty 0 = 2 units
  const air = r.items.find((x) => x.article === "APPMG2L4ID/A")!;
  assert.deepEqual(air, { category: "iPhone", article: "APPMG2L4ID/A", description: "IPHONE AIR 256GB SPACE BLACK", qty: 2 });
  assert.equal(r.items.some((x) => x.article.endsWith("-D")), false);
  assert.equal(r.items.find((x) => x.article === "AMNAPAADL65EUWH")!.category, "Aksesoris");
  assert.equal(r.items.find((x) => x.article === "AMNAPAADL65EUWH")!.qty, 2); // Qty 2 on one line
  assert.equal(r.totals.iPhone, 4);
  assert.equal(r.items.reduce((a, x) => a + x.qty, 0), 9);
  // grand total matches → only the "skipped" notes
  assert.equal(r.warnings.filter((w) => /Grand Total/.test(w)).length, 0);
  assert.ok(r.warnings.some((w) => /unit demo tidak diimport \(1 unit\)/.test(w)));
  // SOH from Excel matches the Android Excel price list by article
  assert.equal(matchArticles("GALAXY WATCH8 40MM", ["SSUSMR930"], r.items)[0].color, "SILVER");
});

test("soh excel: qty mismatch with the Grand Total is reported; date falls back to the Excel serial", () => {
  const g = grid(10);
  g[0][8] = "Stock Position Report";
  const r = parseSohXlsx(g);
  assert.ok(r.warnings.some((w) => /≠ Grand Total 10/.test(w)));
  assert.equal(r.date, "2026-10-25");
});
