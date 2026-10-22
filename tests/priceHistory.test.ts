import { test } from "node:test";
import assert from "node:assert/strict";
import { diffPrices, groupUpdates } from "@/lib/domain/priceHistory";
import type { PriceItem } from "@/types/pricelist";

const it = (name: string, normal: number, promo: number, extra: Partial<PriceItem> = {}): PriceItem => ({ kind: "android", brand: "Samsung", series: "GALAXY A SERIES", name, normal, promo, status: "ACTIVE", ...extra });
const meta = { ts: "2026-10-22T02:00:00.000Z", kind: "android" as const, date: "2026-10-22", prevDate: "2026-10-19", by: "1" };

test("diffPrices: price down / up, new, removed, status; unchanged rows are not listed", () => {
  const prev = [it("A17 8/128", 3_499_000, 3_299_000), it("A27 8/256", 4_999_000, 4_999_000), it("A07 4/64", 1_599_000, 1_599_000), it("S25 FE", 9_999_000, 8_999_000), it("A57 8/256", 6_499_000, 6_499_000)];
  const next = [it("A17 8/128", 3_499_000, 2_999_000), it("A27 8/256", 5_199_000, 5_199_000), it("A07 4/64", 1_599_000, 1_599_000), it("S25 FE", 9_999_000, 8_999_000, { status: "EOL" }), it("A37 8/128", 5_499_000, 5_499_000)];
  const d = diffPrices(prev, next, meta);
  assert.deepEqual(d.map((x) => [x.change, x.name]), [["turun", "A17 8/128"], ["naik", "A27 8/256"], ["baru", "A37 8/128"], ["hilang", "A57 8/256"], ["status", "S25 FE"], ["import", "5 tipe"]]);
  assert.deepEqual([d[0].oldPromo, d[0].newPromo], [3_299_000, 2_999_000]);
});

test("diffPrices: same-name rows are paired by price, Apple installment price counts", () => {
  const prev = [it("TAB A11 4/64G", 2_299_000, 2_299_000), it("TAB A11 4/64G", 2_799_000, 2_799_000)];
  const next = [it("TAB A11 4/64G", 2_299_000, 2_299_000), it("TAB A11 4/64G", 2_699_000, 2_699_000)];
  assert.deepEqual(diffPrices(prev, next, meta).map((x) => [x.change, x.oldNormal, x.newNormal]), [["turun", 2_799_000, 2_699_000], ["import", null, null]]);
  const ap = (credit: number): PriceItem => ({ kind: "apple", brand: "Apple", series: "iPhone 17", name: "iPhone 17 256GB", normal: 16_999_000, promo: 15_999_000, credit, status: "ACTIVE" });
  const d = diffPrices([ap(16_499_000)], [ap(16_299_000)], { ...meta, kind: "apple" });
  assert.equal(d[0].change, "turun");
});

test("groupUpdates: one entry per upload with counts, newest first", () => {
  const older = diffPrices([it("A", 1, 1)], [it("A", 2, 2)], { ...meta, ts: "2026-10-01T00:00:00.000Z" });
  const newer = diffPrices([it("A", 2, 2)], [it("A", 2, 2), it("B", 3, 3)], meta);
  const g = groupUpdates([...older, ...newer]);
  assert.deepEqual(g.map((u) => [u.ts, u.count.naik, u.count.baru, u.size]), [["2026-10-22T02:00:00.000Z", 0, 1, "2 tipe"], ["2026-10-01T00:00:00.000Z", 1, 0, "1 tipe"]]);
});

test("groupUpdates keeps the change order (turun, naik, baru, hilang) even when lines come back reversed", () => {
  const d = diffPrices([it("A", 2, 2), it("B", 1, 1), it("C", 5, 5)], [it("A", 1, 1), it("B", 2, 2), it("D", 3, 3)], meta);
  assert.deepEqual(groupUpdates([...d].reverse())[0].changes.map((c) => c.change), ["turun", "naik", "baru", "hilang"]);
});
