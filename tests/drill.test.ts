import { test } from "node:test";
import assert from "node:assert/strict";
import { articleSales, drillLines } from "@/lib/domain/drill";
import type { SalesLine } from "@/types/domain";

const line = (p: Partial<SalesLine>): SalesLine =>
  ({ date: "2026-10-01", nik: "1", staffName: "A", article: "ART", description: "DESC", invoice: "I", amount: 100, type: "DEVICES", brand: "APPLE", category: "", group: "Apple", lob: "iPhone", vasProvider: null, supplier: null, isChannel: false, qty: 1, qtySource: "exact", countsInQty: true, ...p }) as SalesLine;

test("drill: lines per Apple LOB / Android brand / VAS provider", () => {
  const ls = [line({}), line({ lob: "iPad" }), line({ group: "Android", lob: "Samsung", brand: "SAMSUNG" }), line({ group: "VAS", lob: null, vasProvider: "Qoala" })];
  assert.equal(drillLines(ls, "apple", "iPhone").length, 1);
  assert.equal(drillLines(ls, "android", "Samsung").length, 1);
  assert.equal(drillLines(ls, "vas", "Qoala").length, 1);
});

test("drill: articles sorted by qty, staff per article sums to the article", () => {
  const ls = [
    line({ article: "X", staffName: "Budi", nik: "2", qty: 2, amount: 200 }),
    line({ article: "X", staffName: "Ani", nik: "3", qty: 3, amount: 300 }),
    line({ article: "Y", staffName: "Budi", nik: "2", qty: 1, amount: 50 }),
    line({ article: "Y", staffName: "Budi", nik: "2", qty: 1, amount: 50, countsInQty: false }), // not a qty type
  ];
  const r = articleSales(ls);
  assert.deepEqual(r.map((a) => [a.article, a.qty, a.value]), [["X", 5, 500], ["Y", 1, 100]]);
  assert.deepEqual(r[0].staff.map((s) => [s.name, s.qty]), [["Ani", 3], ["Budi", 2]]);
  assert.equal(articleSales(ls, true)[1].qty, 2); // VAS counts every line
});

test("splitVariant: type vs colour for the description formats in the sales data", async () => {
  const { splitVariant } = await import("@/lib/domain/drill");
  const cases: Array<[string, string, string]> = [
    ["IPHONE 18 PRO MAX 256GB BURGUN", "IPHONE 18 PRO MAX 256GB", "BURGUN"],
    ["IPHONE 18 PRO MAX 256GB GLACIE", "IPHONE 18 PRO MAX 256GB", "GLACIE"],
    ["IPHONE 17 PRO 256GB DEEP BLUE", "IPHONE 17 PRO 256GB", "DEEP BLUE"],
    ["IPHONE 18 PRO MAX 1TB BURGUNDY", "IPHONE 18 PRO MAX 1TB", "BURGUNDY"],
    ["IPAD 11TH WI-FI 128GB SILVER", "IPAD 11TH WI-FI 128GB", "SILVER"],
    ["IPAD AIR 11 WIFI 256GB STL M4", "IPAD AIR 11 WIFI 256GB M4", "STL"],
    ["IPAD PRO 11-INCH M5 WI-FI CEL", "IPAD PRO 11-INCH M5 WI-FI CEL", ""],
    ["MBN 13 SLV/8GB/512GB-IND", "MBN 13 8GB/512GB-IND", "SLV"],
    ["MBA 13.6 MDN/M5/8C GPU/16GB/51", "MBA 13.6 M5/8C GPU/16GB/51", "MDN"],
    ["APPLE WATCH 11 46 RG AL LB SB", "APPLE WATCH 11 46", "RG AL LB SB"],
    ["APPLE WATCH SE 3 40 S AL S SB", "APPLE WATCH SE 3 40", "S AL S SB"],
    ["APPLE WATCH ULTRA3 49 NT TI NT", "APPLE WATCH ULTRA3 49", "NT TI NT"],
    ["AIRPODS PRO 3", "AIRPODS PRO 3", ""],
    ["GALAXY A17 8/128GB LIGHT BLUE", "GALAXY A17 8/128GB", "LIGHT BLUE"],
    ["GALAXY TAB A11 PLUS WIFI 6/128", "GALAXY TAB A11 PLUS WIFI 6/128", ""],
    ["REDMI NOTE 17 PRO MAX 5G 8/256", "REDMI NOTE 17 PRO MAX 5G 8/256", ""],
    ["REDMI PAD 2 4G 4/256GB GRAY", "REDMI PAD 2 4G 4/256GB", "GRAY"],
    ["GALAXY A37 5G 8/256GB DARK GRE", "GALAXY A37 5G 8/256GB", "DARK GRE"],
    ["SAMSUNG Z FOLD 8 ULTRA 12/256G", "SAMSUNG Z FOLD 8 ULTRA 12/256G", ""],
    ["IPHONE AIR 256GB SKY BLUE", "IPHONE AIR 256GB", "SKY BLUE"],
  ];
  for (const [d, type, color] of cases) assert.deepEqual(splitVariant(d), { type, color }, d);
});

test("typeSales: colours of one type are summed, best-selling type first", async () => {
  const { typeSales } = await import("@/lib/domain/drill");
  const a = (description: string, qty: number) => ({ article: description, description, qty, value: qty * 10, staff: [] });
  const r = typeSales([a("IPHONE 18 PRO MAX 256GB BURGUN", 25), a("IPHONE 18 PRO 256GB BURGUNDY", 18), a("IPHONE 18 PRO 256GB GLACIER", 6), a("IPHONE 18 PRO MAX 256GB GLACIE", 7)]);
  assert.deepEqual(r.map((t) => [t.type, t.qty, t.variants.length]), [["IPHONE 18 PRO MAX 256GB", 32, 2], ["IPHONE 18 PRO 256GB", 24, 2]]);
  assert.deepEqual(r[0].variants.map((v) => v.color), ["BURGUN", "GLACIE"]);
});
