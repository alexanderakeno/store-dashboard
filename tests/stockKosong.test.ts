import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyStock, fulfillmentText } from "@/lib/domain/stockKosong";
import type { SalesLine } from "@/types/domain";
import type { SohItem } from "@/types/soh";

const line = (date: string, article: string, description: string, qty: number, x: Partial<SalesLine> = {}): SalesLine =>
  ({ date, nik: "1", staffName: "A", article, description, invoice: "I", amount: 1, type: "DEVICES", brand: "APPLE", category: "PHONE", group: "Apple", lob: "iPhone", vasProvider: null, supplier: null, isChannel: false, qty, qtySource: "exact", countsInQty: true, ...x }) as SalesLine;
const soh = (category: string, article: string, description: string, qty: number): SohItem => ({ category, article, description, qty });

test("emptyStock: sold in window and missing / zero in SOH, grouped per category with in-stock colours", () => {
  const items = [
    soh("iPhone", "IP-BLK", "IPHONE 17 256GB BLACK", 3),
    soh("iPhone", "IP-BLU", "IPHONE 17 256GB BLUE", 0),
    soh("MacBook", "MB-1", "MBA 13 /M4/8C GPU/16GB/256GB", 1),
    soh("Samsung", "SM-1", "GALAXY A17 8/128 BLACK", 2),
  ];
  const lines = [
    line("2026-10-20", "IP-BLU", "IPHONE 17 256GB BLUE", 2), // zero in SOH → kosong, black ready
    line("2026-10-05", "IP-WHT", "IPHONE 17 256GB WHITE", 1), // not in SOH → kosong
    line("2026-10-21", "IP-BLK", "IPHONE 17 256GB BLACK", 4), // in stock → not listed
    line("2026-09-10", "IP-OLD", "IPHONE 16 128GB PINK", 5), // before window
    line("2026-10-02", "MB-2", "MBA 13 /M4/8C GPU/16GB/512GB", 1, { category: "LAPTOPS", lob: "Mac" }), // Mac → MacBook
    line("2026-10-03", "SM-9", "GALAXY S25 12/256 GREY", 1, { group: "Android", brand: "SAMSUNG", lob: "Samsung" }),
    line("2026-10-04", "SM-9", "GALAXY S25 12/256 GREY", -1, { group: "Android", brand: "SAMSUNG", lob: "Samsung" }), // returned → net 0
    line("2026-10-06", "VV-1", "VIVO Y29 8/256 GREEN", 1, { group: "Android", brand: "VIVO", lob: "Vivo" }), // brand absent from SOH
    line("2026-10-06", "CASE-1", "CASE IPHONE 17", 3, { group: "ACC", lob: null, type: "ACCESSORIES" }), // accessories skipped
  ];
  const g = emptyStock(items, ["iPhone", "MacBook", "Samsung"], lines, "2026-09-23", "2026-10-22");
  assert.deepEqual(g.map((x) => [x.category, x.inSoh, x.sold, x.items.map((i) => i.article)]), [
    ["iPhone", true, 3, ["IP-BLU", "IP-WHT"]],
    ["MacBook", true, 1, ["MB-2"]],
    ["Vivo", false, 1, ["VV-1"]],
  ]);
  assert.deepEqual(g[0].items[0].alt, [{ color: "BLACK", qty: 3 }]);
  assert.equal(g[0].items[0].lastSold, "2026-10-20");
  const txt = fulfillmentText(g, { store: "QF10", from: "2026-09-23", to: "2026-10-22", sohDate: "2026-10-23" });
  assert.match(txt, /\*iPhone\*\n- IPHONE 17 256GB BLUE \(IP-BLU\) · sold 2 · terakhir terjual 20\/10/);
});
