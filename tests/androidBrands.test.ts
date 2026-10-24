import { test } from "node:test";
import assert from "node:assert/strict";
import { androidBrands } from "@/lib/domain/extra";
import type { SalesLine } from "@/types/domain";

const l = (lob: string | null, qty: number, amount: number, x: Partial<SalesLine> = {}): SalesLine =>
  ({ date: "2026-10-01", nik: "1", staffName: "A", article: "X", description: "D", invoice: "I", amount, type: "DEVICES", brand: "B", category: "C", group: "Android", lob, vasProvider: null, supplier: null, isChannel: false, qty, qtySource: "exact", countsInQty: true, ...x }) as SalesLine;

test("androidBrands: qty & value per Android brand, returns net out, target brands with 0, non-Android ignored", () => {
  const r = androidBrands(
    [l("Samsung", 2, 10_000_000), l("Oppo", 1, 4_000_000), l("Samsung", -1, -5_000_000), l("iPhone", 3, 50_000_000, { group: "Apple" }), l(null, 1, 100_000, { group: "ACC" })],
    ["Xiaomi", "samsung"],
  );
  assert.deepEqual(r, [
    { brand: "Samsung", qty: 1, value: 5_000_000 },
    { brand: "Oppo", qty: 1, value: 4_000_000 },
    { brand: "Xiaomi", qty: 0, value: 0 },
  ]);
});
