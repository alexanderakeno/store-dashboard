import { test } from "node:test";
import assert from "node:assert/strict";
import type { PdfText } from "@/lib/parsers/soh";
import { brandOf, modelOf, parsePriceListPdf, priceListDate } from "@/lib/parsers/pricelist";
import { matchStock, priceModels, qoalaFor } from "@/lib/domain/pricelist";

/** Synthetic price list laid out like the store PDF: two side-by-side blocks, series headers, Qoala table. */
function page(): PdfText[] {
  const t = (str: string, x: number, y: number, h = 5): PdfText => ({ page: 1, str, x, y, w: str.length * 2.3, h });
  const out: PdfText[] = [t("DEMO PRICE LIST 19 OKTOBER 2026 - FURTHER NOTICE", 27, 781, 7), t("PT DEMO", 485, 781)];
  const head = (series: string, sx: number, x: number, y: number) => out.push(t(series, sx, y, 6), t("Normal Price", x + 113, y, 6), t("Promotion Price", x + 156, y, 6), t("Product Remarks", x + 203, y, 6));
  const row = (name: string, normal: string, promo: string, status: string, x: number, y: number) => out.push(t(name, x, y), t(normal, x + 130, y), t(promo, x + 177, y), t(status, x + 216, y));
  // left block
  head("GALAXY S SERIES", 59, 27, 751);
  row("GALAXY S26 12/256GB", "16.499.000", "14.499.000", "ACTIVE", 27, 745);
  row("GALAXY S26 12/512GB", "19.499.000", "17.499.000", "ACTIVE", 27, 739);
  head("GALAXY A SERIES", 59, 27, 720);
  row("GALAXY A17 5G 8/256GB", "5.299.000", "4.499.000", "ACTIVE", 27, 714);
  row("GALAXY WATCH 8 44MM DARK", "5.999.000", "4.499.000", "EOL", 27, 708);
  // right block
  head("MATEPAD SERIES", 365, 322, 751);
  row("HUAWEI MATEPAD 11.5 8/256GB", "8.999.000", "8.599.000", "ACTIVE", 322, 745);
  row("XIAOMI 17T PRO 12/512GB", "12.999.000", "12.999.000", "ACTIVE", 322, 739);
  out.push(t("QOALA PROTECTION", 365, 700), t("TENOR", 480, 700));
  out.push(t("ARTICLE & TIER", 322, 694), t("12 MONTHS", 440, 694), t("18 MONTHS", 487, 694), t("24 MONTHS", 532, 694));
  out.push(t("KLABRONZE / Rp 0 - Rp 3.000.000", 322, 688), t("200.000", 450, 688), t("250.000", 497, 688), t("280.000", 542, 688));
  out.push(t("KLASILVER / Rp 3.000.001 - Rp 5.000.000", 322, 682), t("350.000", 450, 682), t("435.000", 497, 682), t("490.000", 542, 682));
  return out.sort(() => 0.5 - Math.random()); // pdf.js order is not guaranteed
}

test("price list PDF: blocks, series, prices, status, Qoala", () => {
  const r = parsePriceListPdf(page());
  assert.equal(r.date, "2026-10-19");
  assert.deepEqual(r.kinds, ["android"]);
  assert.equal(r.items.length, 6);
  assert.deepEqual(r.items.find((x) => x.name === "GALAXY S26 12/512GB"), { kind: "android", brand: "Samsung", series: "GALAXY S SERIES", name: "GALAXY S26 12/512GB", normal: 19499000, promo: 17499000, status: "ACTIVE" });
  assert.equal(r.items.find((x) => x.name.startsWith("GALAXY WATCH"))?.status, "EOL");
  assert.equal(r.items.find((x) => x.name.startsWith("HUAWEI"))?.series, "MATEPAD SERIES");
  assert.equal(r.items.find((x) => x.name.startsWith("XIAOMI"))?.brand, "Xiaomi");
  assert.deepEqual(r.qoala, [
    { tier: "KLABRONZE", range: "Rp 0 - Rp 3.000.000", fees: { "12": 200000, "18": 250000, "24": 280000 } },
    { tier: "KLASILVER", range: "Rp 3.000.001 - Rp 5.000.000", fees: { "12": 350000, "18": 435000, "24": 490000 } },
  ]);
  assert.deepEqual(r.warnings, []);
});

test("price list: not a price list PDF → warning, no items", () => {
  const r = parsePriceListPdf([{ page: 1, str: "Stock On Hand", x: 10, y: 10, w: 30, h: 4 }]);
  assert.equal(r.items.length, 0);
  assert.match(r.warnings[0], /Normal Price/);
});

test("price list helpers: date, brand, model/variant split", () => {
  assert.equal(priceListDate("PRICE LIST 19 OKTOBER 2026"), "2026-10-19");
  assert.equal(priceListDate("update 06/10/2026"), "2026-10-06");
  assert.equal(brandOf("REDMI NOTE 17 6/128GB", "REDMI NOTE SERIES"), "Xiaomi");
  assert.equal(brandOf("IPHONE 18 PRO MAX 256GB", ""), "Apple");
  assert.deepEqual(modelOf("GALAXY A17 5G 8/256GB"), { model: "GALAXY A17 5G", variant: "8/256GB" });
  assert.deepEqual(modelOf("XIAOMI 17T PRO 12/512GB"), { model: "XIAOMI 17T PRO", variant: "12/512GB" });
  assert.deepEqual(modelOf("GALAXY WATCH 8 44MM DARK"), { model: "GALAXY WATCH 8", variant: "44MM DARK" });
  assert.deepEqual(modelOf("AMAZFIT ACTIVE MAX"), { model: "AMAZFIT ACTIVE MAX", variant: "" });
});

test("price list: SOH stock per colour, grouping per model, Qoala tier", () => {
  const soh = [
    { category: "Samsung", article: "SYN-1", description: "GALAXY A07 4/64GB LIGHT VIOLET", qty: 2 },
    { category: "Samsung", article: "SYN-2", description: "GALAXY A07 4/64GB BLACK", qty: 5 },
    { category: "Samsung", article: "SYN-3", description: "GALAXY A07 4/128GB BLACK", qty: 1 },
    { category: "Samsung", article: "SYN-4", description: "GALAXY TAB S10 LITE 6/128GB GREY", qty: 3 },
  ];
  assert.deepEqual(matchStock("GALAXY A07 4/64GB", soh), [
    { article: "SYN-2", color: "BLACK", qty: 5 },
    { article: "SYN-1", color: "LIGHT VIOLET", qty: 2 },
  ]);
  assert.equal(matchStock("GALAXY TAB S10 LITE 6/128G", soh)[0]?.color, "GREY"); // G ≡ GB
  const items = [
    { kind: "android" as const, brand: "Samsung", series: "A", name: "GALAXY A07 4/64GB", normal: 2499000, promo: 2299000, status: "ACTIVE" },
    { kind: "android" as const, brand: "Samsung", series: "A", name: "GALAXY A07 4/128GB", normal: 2899000, promo: 2599000, status: "ACTIVE" },
    { kind: "apple" as const, brand: "Apple", series: "IPHONE", name: "IPHONE 18 256GB", normal: 1, promo: 1, status: "ACTIVE" },
  ];
  const m = priceModels(items, "android", soh);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].variants.map((v) => [v.variant, v.stock.length]), [["4/64GB", 2], ["4/128GB", 1]]);
  const tiers = [{ tier: "BRONZE", range: "Rp 0 - Rp 3.000.000", fees: {} }, { tier: "SILVER", range: "Rp 3.000.001 - Rp 5.000.000", fees: {} }];
  assert.equal(qoalaFor(2299000, tiers)?.tier, "BRONZE");
  assert.equal(qoalaFor(3000001, tiers)?.tier, "SILVER");
  assert.equal(qoalaFor(9000000, tiers), null);
});
