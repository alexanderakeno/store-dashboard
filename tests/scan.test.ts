import { test } from "node:test";
import assert from "node:assert/strict";
import { findArticle, normCode, scanLookup } from "@/lib/domain/scan";
import { barcodeOf, parseSohXlsx } from "@/lib/parsers/sohXlsx";
import type { SohItem } from "@/types/soh";
import type { AccPriceItem } from "@/types/accPrice";

const soh: SohItem[] = [
  { category: "Aksesoris", article: "APPMD3J4ZA/A", description: "20W USB-C POWER ADAPTER", qty: 107, price: 499000, barcodes: ["194253415247"] },
  { category: "Aksesoris", article: "UNQ8886463690277", description: "UNIQ COMBAT IP17 PM BLACK", qty: 8 },
  { category: "Aksesoris", article: "SSUEF-PA376CBEGWW", description: "A37 SILICONE CASE BLACK", qty: 3, price: 199000, barcodes: ["8806097123456"] },
  { category: "iPhone", article: "APPMTP03ID/A", description: "IPHONE 15 128GB BLACK", qty: 5, barcodes: ["0195949036460"] },
];
const acc: AccPriceItem[] = [
  { article: "APPMD3J4ZA/A", brand: "APPLE", description: "20W USB-C POWER ADAPTER", category: "Charger", srp: 549000, current: 499000, price: 549000, remark: "back To normal" },
  { article: "UNQ8886463690277", brand: "UNIQ", description: "UNIQ COMBAT IP17 PRO MAX CASE BLACK", category: "Case", srp: 449000, current: 449000, price: 359200, remark: "Promo November 2026" },
  { article: "CTU4897071251051", brand: "CASESTUDI", description: "NOT IN STOCK CASE", category: "Case", srp: 300000, current: 300000, price: 300000 },
];
const noDevice = () => null;

test("barcode cells and codes are normalised (leading zeros, separators, numeric cells)", () => {
  assert.equal(barcodeOf(8886463690277), "8886463690277");
  assert.equal(barcodeOf(" 0195-949036460 "), "0195949036460");
  assert.equal(barcodeOf("12"), "");
  assert.equal(normCode("0195949036460"), "195949036460");
  assert.equal(normCode("appmd3j4za/a"), "APPMD3J4ZAA");
});

test("scan finds the article: SOH barcode, typed article, EAN inside the article, list-only article", () => {
  assert.deepEqual(findArticle("194253415247", soh, acc), { article: "APPMD3J4ZA/A", match: "barcode" });
  assert.deepEqual(findArticle("195949036460", soh, acc), { article: "APPMTP03ID/A", match: "barcode" }); // UPC-A vs EAN-13 with a leading 0
  assert.deepEqual(findArticle("appmd3j4za/a", soh, acc), { article: "APPMD3J4ZA/A", match: "article" });
  assert.deepEqual(findArticle("8886463690277", soh, acc), { article: "UNQ8886463690277", match: "suffix" });
  assert.deepEqual(findArticle("4897071251051", soh, acc), { article: "CTU4897071251051", match: "suffix" });
  assert.equal(findArticle("9999999999999", soh, acc), null);
  assert.equal(findArticle("12", soh, acc), null);
});

test("scan result: accessories list price first, device price list, SOH price, stock", () => {
  const a = scanLookup("194253415247", soh, acc, noDevice)!;
  assert.deepEqual([a.price, a.normal, a.current, a.qty, a.src, a.remark], [549000, 549000, 499000, 107, "acc", "back To normal"]);
  const u = scanLookup("8886463690277", soh, acc, noDevice)!;
  assert.deepEqual([u.price, u.normal, u.qty, u.description], [359200, 449000, 8, "UNIQ COMBAT IP17 PRO MAX CASE BLACK"]);
  const s = scanLookup("8806097123456", soh, acc, noDevice)!;
  assert.deepEqual([s.price, s.src], [199000, "soh"]);
  const d = scanLookup("195949036460", soh, acc, () => ({ price: 13999000, normal: 15499000, name: "IPHONE 15 128GB", brand: "Apple" }))!;
  assert.deepEqual([d.price, d.normal, d.src, d.brand], [13999000, 15499000, "device", "Apple"]);
  const out = scanLookup("4897071251051", soh, acc, noDevice)!;
  assert.deepEqual([out.qty, out.price], [null, 300000]); // in the list, not in stock
});

test("SOH Excel keeps the barcode column per article", () => {
  const rows: unknown[][] = [
    ["Store :", "QF10", "Date :", "", "Stock Position Report For 09-11-2026"],
    ["APPLE", "ACC", "ACCESSORIES", "CHARGER", "APPMD3J4ZA/A / 20W USB-C POWER ADAPTER", 194253415247, 499000, 2, 998000],
    ["APPLE", "ACC", "ACCESSORIES", "CHARGER", "APPMD3J4ZA/A / 20W USB-C POWER ADAPTER", "194253415247", 499000, 1, 499000],
    ["UNIQ", "ACC", "ACCESSORIES", "CASE", "UNQ8886463690277 / UNIQ CASE", "", 449000, 1, 449000],
  ];
  const r = parseSohXlsx(rows);
  const a = r.items.find((x) => x.article === "APPMD3J4ZA/A")!;
  assert.deepEqual([a.qty, a.barcodes], [3, ["194253415247"]]);
  assert.equal(r.items.find((x) => x.article === "UNQ8886463690277")!.barcodes, undefined);
});
