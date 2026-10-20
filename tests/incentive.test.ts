import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES } from "@/config/business";
import { incentiveView, qoalaFee } from "@/lib/domain/incentive";
import { parseAccFocus } from "@/lib/parsers/extras";
import type { SalesLine } from "@/types/domain";

const line = (p: Partial<SalesLine>): SalesLine =>
  ({ date: "2026-10-01", nik: "1", staffName: "CHELSY ARRAHMAT", article: "A", description: "D", invoice: "I", amount: 100, type: "DEVICES", brand: "APPLE", category: "", group: "Apple", lob: "iPhone", vasProvider: null, supplier: null, isChannel: false, qty: 1, qtySource: "exact", countsInQty: true, ...p }) as SalesLine;
const qoala = (amount: number, qty = 1, staffName = "CHELSY ARRAHMAT") => line({ group: "VAS", lob: null, vasProvider: "Qoala", type: "ACCESSORIES", brand: "KOALA", amount, qty, staffName });

const R = DEFAULT_RULES.incentive;

test("qoalaFee tiers: <1jt 20rb, 1jt 40rb, 1,9jt 60rb, ≥2jt 80rb", () => {
  assert.equal(qoalaFee(699_000, R.qoalaTiers), 20_000);
  assert.equal(qoalaFee(1_000_000, R.qoalaTiers), 40_000);
  assert.equal(qoalaFee(1_499_000, R.qoalaTiers), 40_000);
  assert.equal(qoalaFee(1_900_000, R.qoalaTiers), 60_000);
  assert.equal(qoalaFee(1_999_000, R.qoalaTiers), 60_000);
  assert.equal(qoalaFee(2_000_000, R.qoalaTiers), 80_000);
  assert.equal(qoalaFee(5_065_000, R.qoalaTiers), 80_000);
});

test("devices: 30rb per unit for Mac/iPhone/iPad/Watch; AirPods and Android not paid; returns subtract", () => {
  const v = incentiveView(
    [line({ qty: 2 }), line({ lob: "Mac" }), line({ lob: "iPad" }), line({ lob: "Apple Watch" }), line({ lob: "AirPods" }), line({ group: "Android", lob: "Samsung" }), line({ qty: -1, amount: -100 })],
    R, null, ["Chelsy Arrahmat"],
  );
  const r = v.rows[0];
  assert.equal(r.device.iPhone.qty, 1);
  assert.equal(r.deviceFee, (1 + 1 + 1 + 1) * 30_000);
});

test("qoala: each policy priced on its own, then summed; online channel ignored", () => {
  const v = incentiveView(
    [qoala(1_200_000), qoala(2_400_000, 2), qoala(2_500_000), qoala(800_000), qoala(1_950_000), line({ ...qoala(1_200_000), isChannel: true, staffName: "MAPEMALL" })],
    R, null, ["Chelsy Arrahmat"],
  );
  const r = v.rows[0];
  // 1,2jt→40 · 2×1,2jt→2×40 · 2,5jt→80 · 0,8jt→20 · 1,95jt→60
  assert.equal(r.qoala.policies, 6);
  assert.equal(r.qoala.fee, 40_000 + 80_000 + 80_000 + 20_000 + 60_000);
  assert.deepEqual(r.qoala.tiers.map((t) => t.policies), [1, 3, 1, 1]);
  assert.equal(v.rows.some((x) => x.name === "Mapemall"), false);
  assert.equal(incentiveView([qoala(1_600_000)], R, null, []).qoalaInGap, 1);
});

test("parseAccFocus reads the Data - Akeno leaderboard by label; ACC fee joins staff by name", () => {
  const grid = [
    [],
    ["", "LEADERBOARD ACC FOKUS - MTD 20/Okt/26"],
    ["", "", "ACC FOKUS", "INFINITI GLOBAL ASIA", "", "", "GALAXY ION", "", "", "TOTAL", "", ""],
    ["", "RANK", "SALES NAME", "QTY", "AMOUNT", "INSENTIF", "QTY", "AMOUNT", "INSENTIF", "QTY", "AMOUNT", "INSENTIF"],
    ["", 1, "Chelsy Arrahmat", 5, 2395000, 32500, 3, 2697000, 150000, 65, 41652200, 610000],
    ["", 2, "Elvina Qur'ani", "-", "-", "-", "-", "-", "-", 35, 19193900, 267500],
    ["", 7, ""],
    ["", "TOTAL", "", 18, 11079000, 127500],
  ];
  const b = parseAccFocus(grid)!;
  assert.equal(b.title, "LEADERBOARD ACC FOKUS - MTD 20/Okt/26");
  assert.deepEqual(b.suppliers, ["INFINITI GLOBAL ASIA", "GALAXY ION"]);
  assert.equal(b.staff.length, 2);
  assert.deepEqual(b.staff[0].total, { qty: 65, amount: 41652200, fee: 610000 });
  assert.deepEqual(b.staff[0].bySupplier["GALAXY ION"], { qty: 3, amount: 2697000, fee: 150000 });
  assert.deepEqual(Object.keys(b.staff[1].bySupplier), []);

  const v = incentiveView([line({})], R, b, ["Chelsy Arrahmat", "Elvina Qur'Ani"]);
  const chelsy = v.rows.find((r) => r.name === "Chelsy Arrahmat")!;
  assert.equal(chelsy.acc?.fee, 610_000);
  assert.equal(chelsy.total, 30_000 + 610_000);
  assert.equal(v.rows.find((r) => r.name === "Elvina Qur'Ani")?.acc?.fee, 267_500); // matched despite case
  assert.equal(v.rows.length, 2);
  assert.equal(v.total.acc, 877_500);
});
