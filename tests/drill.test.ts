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
