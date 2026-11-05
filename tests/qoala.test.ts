import { test } from "node:test";
import assert from "node:assert/strict";
import { isWatch, qoalaView } from "@/lib/domain/qoala";
import type { Group, SalesLine } from "@/types/domain";

function L(date: string, staff: string, group: Group, amount: number, o: Partial<SalesLine> = {}): SalesLine {
  return {
    date, nik: null, staffName: staff, article: "A", description: "", invoice: "", amount,
    type: group === "VAS" ? "ACCESSORIES" : "DEVICES", brand: "", category: "PHONE", group,
    lob: null, vasProvider: null, supplier: null, isChannel: false, qty: 1, qtySource: "exact", countsInQty: group !== "VAS", ...o,
  };
}
const Q = (date: string, staff: string, inv: string, amount = 500_000, qty = 1) => L(date, staff, "VAS", amount, { vasProvider: "Qoala", invoice: inv, qty });

test("watches are not Qoala devices", () => {
  assert.equal(isWatch({ lob: "Apple Watch", category: "WATCH", description: "", brand: "APPLE" }), true);
  assert.equal(isWatch({ lob: "Samsung", category: "WATCH", description: "GALAXY WATCH 8", brand: "SAMSUNG" }), true);
  assert.equal(isWatch({ lob: "Amazfit", category: "PHONE", description: "AMAZFIT BIP", brand: "AMAZFIT" }), true);
  assert.equal(isWatch({ lob: "iPhone", category: "PHONE", description: "IPHONE 17", brand: "APPLE" }), false);
});

test("AR per staff, Apple / Android split by invoice, ranking by value, vs last month same days", () => {
  const cur = [
    L("2026-11-01", "Adi", "Apple", 20e6, { lob: "iPhone", invoice: "1" }),
    Q("2026-11-01", "Adi", "1", 900_000),
    L("2026-11-01", "Adi", "Android", 4e6, { lob: "Samsung", invoice: "2" }), // no Qoala → missed
    L("2026-11-02", "Elvina", "Android", 5e6, { lob: "Xiaomi", invoice: "3" }),
    Q("2026-11-02", "Elvina", "3", 300_000),
    Q("2026-11-02", "Elvina", "3", 300_000),
    L("2026-11-02", "Elvina", "Apple", 7e6, { lob: "Apple Watch", category: "WATCH", invoice: "4" }), // watch: ignored
    Q("2026-11-02", "Elvina", "9", 200_000), // invoice without device
    L("2026-11-05", "Adi", "Apple", 20e6, { lob: "iPhone", invoice: "5" }), // after asOf
  ];
  const prev = [
    L("2026-10-01", "Adi", "Apple", 20e6, { lob: "iPhone", invoice: "p1" }),
    L("2026-10-02", "Adi", "Apple", 20e6, { lob: "iPhone", invoice: "p2" }),
    Q("2026-10-02", "Adi", "p2", 450_000),
    L("2026-10-20", "Adi", "Apple", 20e6, { lob: "iPhone", invoice: "p3" }), // outside 1–2
    Q("2026-10-20", "Adi", "p3", 999_000),
  ];
  const v = qoalaView(cur, "2026-11-02", prev);
  assert.equal(v.cur.dev, 3);
  assert.equal(v.cur.devApple, 1);
  assert.equal(v.cur.q, 4);
  assert.equal(v.cur.qApple, 1);
  assert.equal(v.cur.qAndroid, 2);
  assert.equal(v.cur.qOther, 1);
  assert.equal(v.cur.missed, 1);
  assert.equal(Math.round(v.cur.ar!), 133);
  assert.equal(v.cur.value, 1_700_000);
  // ranking by Qoala value: Adi 900k > Elvina 800k
  assert.deepEqual(v.staff.map((s) => s.name), ["Adi", "Elvina"]);
  const adi = v.staff[0];
  assert.equal(adi.cur.arApple, 100);
  assert.equal(adi.cur.arAndroid, 0);
  assert.equal(adi.prev!.value, 450_000); // Oct 20 is outside 1–2
  assert.equal(adi.prev!.ar, 50);
  assert.equal(Math.round(adi.growth!), 100);
  assert.deepEqual(adi.days.map((d) => d.date), ["2026-11-01"]);
  // daily rows, newest first, with last month's same day
  assert.deepEqual(v.days.map((d) => d.date), ["2026-11-02", "2026-11-01"]);
  assert.equal(v.days[0].prev!.value, 450_000);
  assert.equal(v.days[0].staff[0].name, "Elvina");
  assert.equal(v.missed.length, 1);
  assert.equal(v.missed[0].group, "Android");
  assert.equal(v.avgPolicy, 425_000);
});

test("no last month: no comparison", () => {
  const v = qoalaView([L("2026-11-01", "Adi", "Apple", 1, { invoice: "1" })], "2026-11-01", null);
  assert.equal(v.prev, null);
  assert.equal(v.staff[0].prev, null);
  assert.equal(v.days[0].prev, null);
});

test("Digiplus.co.id with a NIK is the Online row, not a staff", () => {
  const v = qoalaView([L("2026-11-01", "Digiplus.co.id", "Apple", 1, { nik: "123", lob: "iPhone", invoice: "1" }), L("2026-11-01", "Adi", "Apple", 1, { lob: "iPhone", invoice: "2" })], "2026-11-01", null);
  assert.deepEqual(v.staff.map((s) => [s.name, s.online]), [["Adi", false], ["Online", true]]);
  assert.equal(v.missed.find((m) => m.staff === "Online")?.group, "Apple");
});
