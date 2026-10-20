import { test } from "node:test";
import assert from "node:assert/strict";
import type { PdfText } from "@/lib/parsers/soh";
import { appleLabel, appleName, assignGroups, isApplePriceListPdf, mergeApple, parseApplePriceListPdf } from "@/lib/parsers/applePricelist";
import { appleTokens, matchAppleStock, priceModels } from "@/lib/domain/pricelist";
import type { SohItem } from "@/types/soh";

const t = (str: string, x: number, y: number, h = 7): PdfText => ({ page: 1, str, x, y, w: str.length * 3, h });

/** Synthetic Apple PDF: Product label centred over its rows, Description, Normal · Cicilan · Cash, optional Qoala table. */
function applePdf(groups: Array<{ label: string; rows: Array<[string, string, string, string]> }>, qoala = false): PdfText[] {
  const out: PdfText[] = [t("PT. DEMO", 250, 781, 8), t("DIGIPLUS PRICE LIST 11 Oktober 2026", 232, 772, 8)];
  out.push(t("Promotion", 488, 763), t("Promotion", 536, 763), t("Product", 74, 759), t("Description", 275, 759), t("Normal Price", 437, 759), t("Cicilan Price", 486, 754), t("Cash Price", 536, 754));
  let y = 746;
  for (const g of groups) {
    const ys: number[] = [];
    for (const [desc, normal, credit, cash] of g.rows) {
      out.push(t(desc, 153, y), t(normal, 443, y), t(credit, 493, y), t(cash, 541, y));
      ys.push(y);
      y -= 8.2;
    }
    out.push(t(g.label, 50, (ys[0] + ys[ys.length - 1]) / 2 - 0.1, 8.3));
  }
  if (qoala) {
    y -= 20;
    out.push(t("QOALA FULL PROTECTION", 438, y + 8), t("HARGA UNIT GADGET", 31, y), t("12 MONTHS", 389, y), t("18 MONTHS", 452, y), t("24 MONTHS", 508, y));
    out.push(t("RP 0 - RP 3.000.000", 31, y - 9), t("KLABRONZE", 158, y - 9), t("Rp 200.000", 402, y - 9), t("Rp 250.000", 462, y - 9), t("Rp 280.000", 520, y - 9));
    out.push(t("RP 50.000.001 - RP 65.000.000", 31, y - 18), t("KLAVVIP", 158, y - 18), t("Rp 3.620.000", 400, y - 18), t("Rp 5.065.000", 519, y - 18));
  }
  return out.sort(() => 0.5 - Math.random()); // pdf.js order is not guaranteed
}

const pdf1 = () =>
  applePdf([
    { label: "Macbook NEO", rows: [["MBN 13 8GB/256GB-IND (Silver,Blush,Citrus,Indigo)", "13.499.000", "12.999.000", "12.999.000"], ["MBN 13 8GB/512GB-IND (Silver,Blush,Citrus,Indigo)", "15.749.000", "15.249.000", "15.249.000"]] },
    {
      label: "Macbook Air 13 M5",
      rows: [
        ["MBA 13.6 /M5/8C GPU/16GB/512GB (Sky Blue, Silver)", "25.249.000", "24.949.000", "24.949.000"],
        ["MBA 13.6 /M5/10C GPU/16GB/1TB (Sky Blue, Silver)", "31.499.000", "31.199.000", "31.199.000"],
        ["MBA 13.6 /M5/10C GPU/24GB/1TB(Sky Blue, Silver)", "35.499.000", "35.199.000", "35.199.000"],
      ],
    },
    { label: "IPAD AIR 11 M4", rows: [["IPAD AIR 11 WI-FI 128GB (Space grey, Blue)", "16.249.000", "15.249.000", "15.249.000"], ["IPAD AIR 11 WI-FI Celluler 128GB (Space grey, Blue)", "19.249.000", "18.249.000", "18.249.000"]] },
  ]);
const pdf2 = () =>
  applePdf(
    [
      { label: "Iphone 17 Pro", rows: [["iPhone 17 Pro 256GB", "24.999.000", "22.999.000", "22.999.000"], ["iPhone 17 Pro512GB", "29.499.000", "27.999.000", "27.499.000"]] },
      { label: "Iphone 17e", rows: [["IPHONE 17E 256GB ( Black , White, Soft Pink)", "13.499.000", "13.499.000", "13.499.000"]] },
    ],
    true,
  );

test("apple price list: centred Product labels, 3 price columns, colours, typo fixes", () => {
  const r = parseApplePriceListPdf(pdf1());
  assert.equal(r.date, "2026-10-11");
  assert.deepEqual(r.kinds, ["apple"]);
  assert.equal(r.items.length, 7);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(
    r.items.map((x) => x.series),
    ["MacBook Neo", "MacBook Neo", "MacBook Air 13 M5", "MacBook Air 13 M5", "MacBook Air 13 M5", "iPad Air 11 M4", "iPad Air 11 M4"],
  );
  assert.deepEqual(r.items[4], { kind: "apple", brand: "Mac", series: "MacBook Air 13 M5", name: "MBA 13.6 /M5/10C GPU/24GB/1TB", normal: 35499000, promo: 35199000, credit: 35199000, note: "Sky Blue, Silver", status: "ACTIVE" });
  assert.equal(r.items[0].name, "MBN 13 8GB/256GB");
  assert.equal(r.items[6].brand, "iPad");
});

test("apple price list: page 2 — cash ≠ cicilan, Qoala fees follow their column", () => {
  const r = parseApplePriceListPdf(pdf2());
  const pro512 = r.items.find((x) => x.name === "iPhone 17 Pro 512GB");
  assert.ok(pro512, "Pro512GB is split");
  assert.equal(pro512.credit, 27999000);
  assert.equal(pro512.promo, 27499000);
  assert.equal(r.items.find((x) => x.name === "iPhone 17e 256GB")?.note, "Black, White, Soft Pink");
  assert.deepEqual(r.qoala, [
    { tier: "KLABRONZE", range: "Rp 0 - Rp 3.000.000", fees: { "12": 200000, "18": 250000, "24": 280000 } },
    { tier: "KLAVVIP", range: "Rp 50.000.001 - Rp 65.000.000", fees: { "12": 3620000, "24": 5065000 } },
  ]);
});

test("apple price list: 2 PDFs merged iPhone → iPad → Mac; Android PDF is not Apple", () => {
  const m = mergeApple([parseApplePriceListPdf(pdf1()), parseApplePriceListPdf(pdf2())]);
  assert.equal(m.items.length, 10);
  assert.deepEqual([...new Set(m.items.map((x) => x.brand))], ["iPhone", "iPad", "Mac"]);
  assert.equal(m.qoala.length, 2);
  assert.equal(isApplePriceListPdf(pdf1()), true);
  assert.equal(isApplePriceListPdf([t("Normal Price", 1, 1), t("Promotion Price", 1, 1), t("Product Remarks", 1, 1)]), false);
  assert.equal(parseApplePriceListPdf([t("Stock On Hand", 1, 1)]).items.length, 0);
});

test("apple helpers: labels, names, group split", () => {
  assert.equal(appleLabel("Iphone 16e"), "iPhone 16e");
  assert.equal(appleLabel("iMAC 24 Inch"), "iMac 24 Inch");
  assert.equal(appleLabel("Watch SE 2nd Gen"), "Watch SE 2nd Gen");
  assert.deepEqual(appleName("IIMAC 24 /M4/10CCP/10CGP/24GB/512-IND (Silver, Green)"), { name: "IMAC 24 /M4/10CCP/10CGP/24GB/512", note: "Silver, Green" });
  // 2 rows, 3 rows, 1 row — each label sits in the middle of its run
  assert.deepEqual(assignGroups([100, 92, 84, 76, 68, 60], [{ y: 96, str: "A" }, { y: 76, str: "B" }, { y: 60, str: "C" }]), ["A", "A", "B", "B", "B", "C"]);
});

test("apple SOH match: tokens, chip from series, Wi-Fi vs Cellular, Pro vs non-Pro", () => {
  const soh = (description: string, qty = 1): SohItem => ({ category: "x", article: description, description, qty }) as SohItem;
  const stock = [
    soh("IPHONE 17 PRO 256GB SILVER", 3),
    soh("IPHONE 17 PRO MAX 256GB DEEP BLUE"),
    soh("IPAD AIR 11 WIFI 128GB PUR M4"),
    soh("IPAD AIR 11 M3 WI-FI 128GB PURPLE"),
    soh("IPAD AIR 11 WF CL 128GB SPG M4"),
    soh("MBA 13.6 STL/M5/8C GPU/16GB/512GB-IND", 2),
    soh("APPLE WATCH 11 46 SI AL PF SB SM GPS-IND"),
  ];
  assert.deepEqual(matchAppleStock("iPhone 17 Pro 256GB", "iPhone 17 Pro", stock), [{ article: "IPHONE 17 PRO 256GB SILVER", color: "SILVER", qty: 3 }]);
  assert.deepEqual(matchAppleStock("IPAD AIR 11 WI-FI 128GB", "iPad Air 11 M4", stock).map((s) => s.color), ["PUR"]);
  assert.deepEqual(matchAppleStock("IPAD AIR 11 WI-FI Celluler 128GB", "iPad Air 11 M4", stock).map((s) => s.color), ["SPG"]);
  assert.deepEqual(matchAppleStock("IPAD AIR 11 WI-FI 128GB", "iPad Air 11 M3", stock).map((s) => s.color), ["PURPLE"]);
  assert.deepEqual(matchAppleStock("MBA 13.6 /M5/8C GPU/16GB/512GB", "MacBook Air 13 M5", stock).map((s) => s.color), ["STL"]);
  assert.deepEqual(matchAppleStock("APPLE WATCH S11 46", "Watch S11", stock).length, 1);
  assert.deepEqual(appleTokens("MAC MINI/M4/10C CPU/10CGPU/16G/256GB"), ["MAC", "MINI", "M4", "10C", "CPU", "10C", "GPU", "16GB", "256GB"]);
});

test("apple models: one per Product label, variant = part not shared by the group", () => {
  const m = mergeApple([parseApplePriceListPdf(pdf1()), parseApplePriceListPdf(pdf2())]);
  const models = priceModels(m.items, "apple", []);
  const by = (k: string) => models.find((x) => x.model === k)!;
  assert.deepEqual(by("iPhone 17 Pro").variants.map((v) => v.variant), ["256GB", "512GB"]);
  assert.deepEqual(by("MacBook Air 13 M5").variants.map((v) => v.variant), ["8C GPU/16GB/512GB", "10C GPU/16GB/1TB", "10C GPU/24GB/1TB"]);
  assert.deepEqual(by("iPad Air 11 M4").variants.map((v) => v.variant), ["128GB", "Celluler 128GB"]);
  assert.equal(by("iPhone 17e").variants[0].variant, "Standar");
  assert.equal(by("iPhone 17 Pro").brand, "iPhone");
});

test("stored data: rows printed twice show once, IPHONE 17E reads iPhone 17e", async () => {
  const { iphoneName } = await import("@/lib/parsers/applePricelist");
  assert.equal(iphoneName("IPHONE 17E 256GB"), "iPhone 17e 256GB");
  assert.equal(iphoneName("iPhone 17 Pro 256GB"), "iPhone 17 Pro 256GB");
  assert.equal(iphoneName("IPAD AIR 11 WI-FI 128GB"), "IPAD AIR 11 WI-FI 128GB");
  const row = { kind: "android" as const, brand: "Samsung", series: "GALAXY WATCH SERIES", name: "GALAXY WATCH 8 CLASSIC 46MM", normal: 6999000, promo: 5999000, status: "EOL" };
  const other = { ...row, name: "GALAXY TAB S10 LITE 6/128G", series: "GALAXY TAB S SERIES", normal: 7999000, promo: 7999000, status: "ACTIVE" };
  const models = priceModels([row, { ...row }, other, { ...other, normal: 6499000, promo: 6499000 }], "android", []);
  assert.equal(models.find((m) => m.model === "GALAXY WATCH 8 CLASSIC")?.variants.length, 1);
  // same name, different price: both kept (the PDF does not say which is which)
  assert.equal(models.find((m) => m.model === "GALAXY TAB S10 LITE")?.variants.length, 2);
  const apple = priceModels([{ kind: "apple", brand: "iPhone", series: "iPhone 17e", name: "IPHONE 17E 256GB", normal: 1, promo: 1, credit: 1, status: "ACTIVE" }], "apple", []);
  assert.equal(apple[0].variants[0].name, "iPhone 17e 256GB");
});
