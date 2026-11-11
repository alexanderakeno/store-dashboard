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

test("qoalaFee tiers: <1jt 20rb, 1–1,5jt 40rb, 1,5–<2jt 60rb, ≥2jt 80rb (real October prices)", () => {
  assert.equal(qoalaFee(699_000, R.qoalaTiers), 20_000);
  assert.equal(qoalaFee(1_000_000, R.qoalaTiers), 40_000);
  assert.equal(qoalaFee(280_000, R.qoalaTiers), 20_000); // Bronze
  assert.equal(qoalaFee(700_000, R.qoalaTiers), 20_000); // Gold
  assert.equal(qoalaFee(1_315_000, R.qoalaTiers), 40_000); // Emerald
  assert.equal(qoalaFee(1_890_000, R.qoalaTiers), 60_000); // Buy 12 Get 24 Tier 6
  assert.equal(qoalaFee(1_970_000, R.qoalaTiers), 60_000); // Diamond
  assert.equal(qoalaFee(2_645_000, R.qoalaTiers), 80_000); // Platinum
  assert.equal(qoalaFee(2_000_000, R.qoalaTiers), 80_000);
  assert.equal(qoalaFee(5_065_000, R.qoalaTiers), 80_000);
});

test("devices: Mac 30rb, iPhone/iPad/Watch 15rb, Android 15rb per unit; AirPods not paid; returns subtract", () => {
  const v = incentiveView(
    [line({ qty: 2 }), line({ lob: "Mac" }), line({ lob: "iPad" }), line({ lob: "Apple Watch" }), line({ lob: "AirPods" }), line({ group: "Android", lob: "Samsung", brand: "SAMSUNG", description: "GALAXY A07 4/64GB" }), line({ qty: -1, amount: -100 })],
    R, null, ["Chelsy Arrahmat"],
  );
  const r = v.rows[0];
  assert.equal(r.device.iPhone.qty, 1);
  assert.equal(r.device.Android.qty, 1);
  assert.equal(r.deviceFee, 1 * 15_000 + 30_000 + 15_000 + 15_000 + 15_000); // iPhone (2 − 1 return) · Mac · iPad · Watch · Android
});

test("Android 15rb except Xiaomi / Motorola watches and Galaxy Fit 3; online accounts get 5rb per Android unit", () => {
  const a = (lob: string, description: string, p: Partial<SalesLine> = {}) => line({ group: "Android", lob, brand: lob.toUpperCase(), description, ...p });
  const v = incentiveView(
    [
      a("Samsung", "GALAXY S26 ULTRA 512GB"),
      a("Samsung", "GALAXY FIT3 GRAY"),
      a("Samsung", "GALAXY FIT 3 PINK"),
      a("Samsung", "GALAXY WATCH 8 44MM"),
      a("Xiaomi", "REDMI WATCH 5 ACTIVE"),
      a("Xiaomi", "XIAOMI SMART BAND 9"),
      a("Xiaomi", "XIAOMI 17T 12/512GB"),
      a("Motorola", "MOTO WATCH FIT"),
      a("Motorola", "MOTOROLA G86 POWER 5G"),
      a("Huawei", "HUAWEI WATCH FIT 5 PRO"),
      a("Samsung", "GALAXY A17", { qty: -1, amount: -1 }),
      a("Samsung", "GALAXY A17", { staffName: "DIGIPLUS.CO.ID" }),
    ],
    R, null, ["Chelsy Arrahmat"],
  );
  const r = v.rows.find((x) => x.name === "Chelsy Arrahmat")!;
  // paid: S26, Galaxy Watch 8, Xiaomi 17T, Moto G86, Huawei Watch Fit, minus 1 return
  assert.equal(r.device.Android.qty, 4);
  assert.equal(r.device.Android.fee, 60_000);
  const online = v.rows.find((x) => x.name === "Digiplus.co.id")!;
  assert.equal(online.device.Android.qty, 1);
  assert.equal(online.device.Android.fee, 5_000);
});

test("qoala: each policy priced on its own, then summed; online channel ignored", () => {
  const v = incentiveView(
    [qoala(1_200_000), qoala(2_400_000, 2), qoala(2_500_000), qoala(800_000), qoala(1_950_000), line({ ...qoala(1_200_000), isChannel: true, staffName: "MAPEMALL" }), qoala(-1_200_000, -1)],
    R, null, ["Chelsy Arrahmat"],
  );
  const r = v.rows[0];
  // 1,2jt→40 · 2×1,2jt→2×40 · 2,5jt→80 · 0,8jt→20 · 1,95jt→60 · refund of a 1,2jt policy→−40
  assert.equal(r.qoala.policies, 5);
  assert.equal(r.qoala.fee, 40_000 + 80_000 + 80_000 + 20_000 + 60_000 - 40_000);
  assert.deepEqual(r.qoala.tiers.map((t) => t.policies), [1, 2, 1, 1]);
  assert.equal(v.rows.some((x) => x.name === "Mapemall"), false);
  assert.equal(incentiveView([{ ...qoala(3_940_000), qtySource: "uncertain" }], R, null, []).qoalaUncertain, 1);
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
    ["", 8, "#REF! (Array result was not expanded because it would overwrite data in Q82.)"],
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
  assert.equal(chelsy.total, 15_000 + 610_000); // one iPhone
  assert.equal(v.rows.find((r) => r.name === "Elvina Qur'Ani")?.acc?.fee, 267_500); // matched despite case
  assert.equal(v.rows.length, 2);
  assert.equal(v.total.acc, 877_500);
});

test("online accounts (Digiplus.co.id, Mapemall): 5rb per device (Apple & Android), no Qoala; other channels still ignored", () => {
  const web = (p: Partial<SalesLine>) => line({ nik: null, staffName: "Digiplus.co.id", ...p });
  const mall = (p: Partial<SalesLine>) => line({ nik: null, staffName: "MAPEMALL", isChannel: true, ...p });
  const v = incentiveView(
    [web({ qty: 3 }), web({ lob: "Mac" }), web({ group: "Android", lob: "Samsung" }), { ...qoala(1_200_000), nik: null, staffName: "Digiplus.co.id" }, mall({ qty: 2 }), mall({ qty: -1, amount: -100 }), line({ nik: null, staffName: "TOKOPEDIA", isChannel: true })],
    R, null, [],
  );
  const d = v.rows.find((r) => r.name === "Digiplus.co.id")!;
  assert.equal(d.deviceFee, 5 * 5_000); // 3 iPhone + 1 Mac + 1 Android
  assert.equal(d.qoala.fee, 0);
  assert.equal(v.rows.find((r) => r.name === "Mapemall")?.deviceFee, (2 - 1) * 5_000); // return subtracts
  assert.equal(v.rows.some((r) => /TOKOPEDIA/i.test(r.name)), false);
});

test("providers: Telkomsel + XL + Indosat value combined per staff, 20rb per full 1 jt; returns subtract; online ignored", () => {
  const telco = (vasProvider: string, amount: number, staffName = "CHELSY ARRAHMAT") => line({ group: "VAS", lob: null, vasProvider, type: "ACCESSORIES", brand: vasProvider.toUpperCase(), amount, staffName, countsInQty: false });
  const v = incentiveView(
    [telco("Telkomsel", 1_400_000), telco("XL", 900_000), telco("Indosat", 750_000), telco("Telkomsel", -100_000), telco("XL", 5_000_000, "DIGIPLUS.CO.ID"), telco("Indosat", 999_000, "Budi")],
    R, null, ["Chelsy Arrahmat", "Budi"],
  );
  const c = v.rows.find((x) => x.name === "Chelsy Arrahmat")!;
  // 1,4 + 0,9 + 0,75 − 0,1 = 2,95 jt → 2 × 20rb
  assert.equal(c.provider.value, 2_950_000);
  assert.equal(c.provider.fee, 40_000);
  assert.deepEqual(c.provider.byProvider, { Telkomsel: 1_300_000, XL: 900_000, Indosat: 750_000 });
  assert.equal(v.rows.find((x) => x.name === "Budi")!.provider.fee, 0); // 999rb: below 1 jt
  assert.equal(v.rows.find((x) => x.name === "Digiplus.co.id")?.provider.fee ?? 0, 0);
  assert.equal(v.total.provider, 40_000);
  assert.equal(c.total, 40_000);
});

test("online accounts: 5rb per device (Apple & Android), no Qoala / provider / accessory fee", () => {
  const W = "DIGIPLUS.CO.ID";
  const board = { title: "LEADERBOARD", staff: [{ name: W, total: { qty: 1, fee: 40_000 }, bySupplier: {} }, { name: "CHELSY ARRAHMAT", total: { qty: 2, fee: 15_000 }, bySupplier: {} }] } as unknown as Parameters<typeof incentiveView>[2];
  const v = incentiveView(
    [
      line({ staffName: W, qty: 2 }),
      line({ staffName: W, lob: "Mac" }),
      line({ staffName: W, group: "Android", lob: "Samsung", brand: "SAMSUNG", description: "GALAXY A57" }),
      qoala(1_200_000, 1, W),
      line({ group: "VAS", lob: null, vasProvider: "Telkomsel", type: "ACCESSORIES", brand: "TELKOMSEL", amount: 3_000_000, staffName: W, countsInQty: false }),
    ],
    R, board, ["Chelsy Arrahmat"],
  );
  const o = v.rows.find((x) => x.name === "Digiplus.co.id")!;
  assert.equal(o.deviceFee, 4 * 5_000);
  assert.equal(o.qoala.fee, 0);
  assert.equal(o.provider.fee, 0);
  assert.equal(o.acc, null);
  assert.equal(o.total, 20_000);
  assert.equal(v.rows.find((x) => x.name === "Chelsy Arrahmat")!.acc?.fee, 15_000);
});
