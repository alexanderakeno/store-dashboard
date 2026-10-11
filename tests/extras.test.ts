import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePromo, parseTracker, parseTrafficTab } from "@/lib/parsers/extras";

const TRACKER = [
  ["Oktober", "CX", "", "", "", "", "", "", "", "", "", "", "", "", "GR"],
  ["2026", "Customer Experience", "", "", "", "", "", "", "", "", "", "", "", "", "Google Review"],
  [],
  ["", "Date", "Day", "Adi", "Chelsy", "Imam", "", "Total CX", "Total Invoice", "AR", "", "", "", "", "Date", "Day", "Adi", "Total GR", "Total Invoice"],
  ["", "10/1/2026", "Kamis", "", "", 1, "", 1, 10, "10%", "", "", "", "", "10/1/2026", "Kamis", 2, 2, 10],
  ["", "10/2/2026", "Jumat", 1, 2, "", "", 3, 12, "25%", "", "", "", "", "10/2/2026", "Jumat", "", "", 12],
  ["", "", "", 1, 2, 1, "", 4, 22],
  ["", "7/1/2026", "Rabu", 9, 9, 9],
];

test("CX & GR tracker blocks", () => {
  const cx = parseTracker(TRACKER, "2026-10", "CX")!;
  assert.deepEqual(cx.staff, ["Adi", "Chelsy", "Imam"]);
  assert.equal(cx.days.length, 2);
  assert.equal(cx.days[1].date, "2026-10-02");
  assert.equal(cx.days[1].byStaff.Chelsy, 2);
  assert.equal(cx.days[1].total, 3);
  assert.equal(cx.days[0].invoices, 10);
  const gr = parseTracker(TRACKER, "2026-10", "GR")!;
  assert.deepEqual(gr.staff, ["Adi"]);
  assert.equal(gr.days[0].total, 2);
});

test("Rekap Promo blocks", () => {
  const g = [
    ["UNIVERSAL", "", "Apple", "", "Samsung", ""],
    [],
    ["Promo", "Keterangan", "Promo", "Keterangan", "Promo", "Keterangan"],
    ["-", "BNPL sampai 30 Sep", "True Zero", "iPhone 15 Plus", "Potongan Fold", "Up to 3,5 jt"],
    ["", "Min 5Jt", "AW", "Free Ugreen 30W", "", "persediaan masih ada"],
    [],
    ["Infinix", "", "Motorola", ""],
    [],
    ["Promo", "Keterangan", "Promo", "Keterangan"],
    ["Promo Mandiri", "CC 0%", "", ""],
  ];
  const p = parsePromo(g);
  assert.deepEqual(p.map((b) => b.brand), ["UNIVERSAL", "Apple", "Samsung", "Infinix"]);
  assert.equal(p[0].items[0].promo, "BNPL sampai 30 Sep");
  assert.equal(p[0].items[0].note, "Min 5Jt");
  assert.equal(p[2].items.some((i) => i.promo === "Infinix"), false);
  assert.equal(p[2].items[0].note, "Up to 3,5 jt · persediaan masih ada");
  assert.equal(p[3].items.length, 1);
});

test("Traffic tab month block", () => {
  const g = [["Oktober", "Traffic", "Invoice", "CVR"], ["1 Oktober", 222, 2, "1%"], ["2 Oktober", 174, 5, "3%"], ["", 396, 7]];
  assert.deepEqual(parseTrafficTab(g, "2026-10"), [{ date: "2026-10-01", traffic: 222 }, { date: "2026-10-02", traffic: 174 }]);
  assert.deepEqual(parseTrafficTab(g, "2026-09"), []);
});
