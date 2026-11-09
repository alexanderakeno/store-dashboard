import { test } from "node:test";
import assert from "node:assert/strict";
import { accDate, isAccPriceListXlsx, parseAccPriceListXlsx } from "@/lib/parsers/accPricelist";
import { accRows, accSummary, packAcc, unpackAcc } from "@/lib/domain/accPrice";
import type { SohItem } from "@/types/soh";

const grid = [
  ["PT. MAP ZONA ADIPERKASA"],
  ["Digimap/ Digiplus Price"],
  [],
  ["Update 8 November 2026"],
  ["Brand", "SAP Article", "Article Mapemall", "SAP Description", "Category", "Reference SRP", "Current SRP Cash", "Repricing Cash", "BR/ Zoutn", "Remarks"],
  ["APPLE", "APPMD3J4ZA/A", "APPMD3J4ZA-A", "20W USB-C POWER ADAPTER", "Charger", 549000, 499000, 549000, "Zout 1", "back To normal 1 Sep. 2026"],
  ["Belkin", "LKNWCB010KRWH", "LKNWCB010KRWH", "60W USB - C WALL CHARGER WT", "Charger", 499000, 499000, 399000, "Zout 2", "Promo November 2026"],
  ["UAG", "UAG114", "UAG114", "UAG CASE IP17 PRO", "Case", 899000, 899000, 899000, null, null],
  ["A.ELEMENTS", "AMNAPAADMODAOGGY ", "x", "AEL MODEL A GY (copy with trailing space)", "Charger", 1299000, 1299000, 1299000, null, null],
  ["A.ELEMENTS", "AMNAPAADMODAOGGY", "x", "AEL MODEL A GY", "Charger", 1199000, 1199000, 1199000, null, null],
  ["X", "NOPRICE", "x", "NO PRICE", "Back screen", null, null, null, null, null],
];

test("accessories price list Excel: header by label, price = Repricing Cash, date, duplicates", () => {
  const sheets = [{ name: "Sheet1", rows: grid }, { name: "Sheet2", rows: [["SAP Article"], ["APPMD3J4ZA/A", "EA", "each", 549000]] }];
  assert.equal(isAccPriceListXlsx(sheets), true);
  assert.equal(isAccPriceListXlsx([{ name: "x", rows: [["Brand", "Type", "Price"]] }]), false);
  const p = parseAccPriceListXlsx(sheets);
  assert.equal(p.date, "2026-11-08");
  assert.equal(p.items.length, 4);
  const adapter = p.items.find((x) => x.article === "APPMD3J4ZA/A")!;
  assert.deepEqual([adapter.srp, adapter.current, adapter.price, adapter.remark], [549000, 499000, 549000, "back To normal 1 Sep. 2026"]);
  assert.equal(p.items.find((x) => x.article === "LKNWCB010KRWH")!.price, 399000);
  // the first of two rows of the same article (trailing space trimmed) wins
  assert.equal(p.items.find((x) => x.article === "AMNAPAADMODAOGGY")!.price, 1299000);
  assert.ok(p.warnings.some((w) => /dua kali/.test(w)) && p.warnings.some((w) => /tanpa harga/.test(w)));
  assert.equal(accDate("8 Nov. 2026"), "2026-11-08");
  assert.equal(accDate("Update 31 Desember 2026"), "2026-12-31");
});

test("price list joined with SOH accessories: list price, SOH price fallback, stock filter, summary", () => {
  const { items } = parseAccPriceListXlsx([{ name: "Sheet1", rows: grid }]);
  const soh: SohItem[] = [
    { category: "Aksesoris", article: "APPMD3J4ZA/A", description: "20W", qty: 107 },
    { category: "Aksesoris", article: "LKNWCB010KRWH", description: "60W", qty: 2 },
    { category: "Aksesoris", article: "SSUEF-PA376CBEGWW", description: "A37 SILICONE CASE BLACK", qty: 3, price: 199000 },
    { category: "Aksesoris", article: "TSLESIMB12-100", description: "ESIM", qty: 7 },
    { category: "iPhone", article: "APPMTP03ID/A", description: "IPHONE 15", qty: 5, price: 15499000 },
  ];
  const rows = accRows(items, soh);
  assert.equal(rows.length, 4); // devices are not accessories
  const by = (a: string) => rows.find((r) => r.article === a)!;
  assert.equal(by("APPMD3J4ZA/A").price, 549000);
  assert.equal(by("APPMD3J4ZA/A").qty, 107);
  assert.deepEqual([by("SSUEF-PA376CBEGWW").price, by("SSUEF-PA376CBEGWW").src], [199000, "soh"]);
  assert.deepEqual([by("TSLESIMB12-100").price, by("TSLESIMB12-100").src], [null, "none"]);
  assert.equal(rows.at(-1)!.src, "none"); // unpriced rows last
  const s = accSummary(rows, soh);
  assert.deepEqual([s.articles, s.units, s.fromList, s.fromSoh, s.noPrice, s.changed, s.promo], [4, 119, 2, 1, 1, 2, 1]);
  // "semua": whole list (stock 0 when not in the SOH) + SOH accessories missing from it
  const all = accRows(items, soh, true);
  assert.equal(all.length, 6);
  assert.equal(all.find((r) => r.article === "UAG114")!.qty, 0);
  // no SOH: whole list, stock unknown
  assert.equal(accRows(items, null).every((r) => r.qty === null), true);
  assert.deepEqual(unpackAcc(packAcc(by("LKNWCB010KRWH"))), by("LKNWCB010KRWH"));
});

test("SOH accessories missing from the list get a brand from the article prefix", () => {
  const list = [{ article: "UNQ8886463690277", brand: "UNIQ", description: "UNIQ CASE", category: "Case", srp: 1, current: 1, price: 1 }];
  const soh: SohItem[] = [
    { category: "Aksesoris", article: "SSUEF-OA176TBEGWW", description: "A17 CARD SLOT CASE", qty: 1 },
    { category: "Aksesoris", article: "UNQ8886463699999", description: "NEW UNIQ", qty: 1 },
    { category: "Aksesoris", article: "ZZZ1", description: "?", qty: 1 },
  ];
  const b = Object.fromEntries(accRows(list, soh).map((r) => [r.article, r.brand]));
  assert.deepEqual(b, { "SSUEF-OA176TBEGWW": "Samsung", UNQ8886463699999: "UNIQ", ZZZ1: "Lainnya" });
});
