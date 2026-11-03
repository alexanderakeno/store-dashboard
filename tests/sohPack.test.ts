import { test } from "node:test";
import assert from "node:assert/strict";
import { packSohRows, sohRows, unpackSohRows } from "@/lib/domain/soh";
import type { SalesLine } from "@/types/domain";

test("SOH rows survive the compact transport (balance from the exact cover days)", () => {
  const items = [
    { category: "iPhone", article: "A1", description: "IPHONE 17 256GB", qty: 13, price: 1 },
    { category: "Samsung", article: "S1", description: "GALAXY A07", qty: 0 },
    { category: "iPhone", article: "A2", description: "IPHONE AIR", qty: 5 },
  ];
  const lines = [{ date: "2026-10-10", article: "a1", qty: 20 }, { date: "2026-10-10", article: "A2", qty: 1 }] as SalesLine[];
  const rows = sohRows(items, lines, "2026-10-10");
  const cats = ["iPhone", "Samsung"];
  const back = unpackSohRows(JSON.parse(JSON.stringify(packSohRows(rows, cats))), cats);
  // A1: 13 / (20/10) = 6.5 days → "low" although it rounds to 7
  assert.equal(rows[0].balance, "low");
  assert.deepEqual(back.map((r) => [r.category, r.article, r.description, r.qty, r.sold, r.coverDays, r.balance]), [
    ["iPhone", "A1", "IPHONE 17 256GB", 13, 20, 7, "low"],
    ["Samsung", "S1", "GALAXY A07", 0, 0, null, "unsold"],
    ["iPhone", "A2", "IPHONE AIR", 5, 1, 50, "ok"],
  ]);
  assert.ok(JSON.stringify(packSohRows(rows, cats)).length < JSON.stringify(rows).length * 0.6);
});
