import { test } from "node:test";
import assert from "node:assert/strict";
import PptxGenJS from "pptxgenjs";
import { buildReport, type ReportInput } from "@/lib/domain/report";
import { buildDeck, defaultManual } from "@/lib/report/pptx";
import type { Group, SalesLine, StoreTarget } from "@/types/domain";

let inv = 0;
function line(date: string, staff: string, group: Group, amount: number, o: Partial<SalesLine> = {}): SalesLine {
  inv++;
  return {
    date,
    nik: null,
    staffName: staff,
    article: "A",
    description: "",
    invoice: o.invoice ?? `INV${inv}`,
    amount,
    type: group === "Apple" || group === "Android" ? "DEVICES" : "ACCESSORIES",
    brand: "",
    category: "",
    group,
    lob: null,
    vasProvider: null,
    supplier: null,
    isChannel: false,
    qty: 1,
    qtySource: "exact",
    countsInQty: group !== "VAS",
    ...o,
  };
}

const target: StoreTarget = {
  month: "2026-10",
  total: 3100,
  byGroup: { Apple: 1550, Android: 930, ACC: 310, VAS: 310 },
  sections: {},
  brands: { Samsung: 500, Oppo: 200, Xiaomi: 230 },
  staff: [
    { name: "Adi", sharePct: 0.5, byGroup: { Apple: 775, Android: 465, ACC: 155, VAS: 155 }, byColumn: {}, total: 1550 },
    { name: "Elvina", sharePct: 0.5, byGroup: { Apple: 775, Android: 465, ACC: 155, VAS: 155 }, byColumn: {}, total: 1550 },
  ],
};

function input(o: Partial<ReportInput> = {}): ReportInput {
  const oct: SalesLine[] = [
    line("2026-10-01", "ADI", "Apple", 1000, { lob: "iPhone" }),
    line("2026-10-02", "Elvina", "Android", 300, { lob: "Samsung" }),
    line("2026-10-02", "Elvina", "ACC", 50, { lob: "AirPods" }),
    line("2026-10-02", "Elvina", "ACC", 20, { lob: null, supplier: "Dino" }),
    line("2026-10-12", "Adi", "VAS", 40, { vasProvider: "Qoala" }),
    line("2026-10-20", "Mapemall", "Apple", 900, { lob: "iPhone", isChannel: true }),
    line("2026-10-31", "Adi", "Android", 100, { lob: "XIAOMI" }),
  ];
  const sep: SalesLine[] = [
    line("2026-09-01", "Adi", "Apple", 500, { lob: "iPhone" }),
    line("2026-09-02", "Elvina", "ACC", 10, { lob: null }),
    line("2026-09-02", "Andhika", "ACC", 30, { lob: "AirPods" }),
    line("2026-09-25", "Adi", "Android", 200, { lob: "Samsung" }),
  ];
  return {
    storeCode: "QF10",
    storeName: "Digiplus Kota Kasablanka",
    month: "2026-10",
    asOf: "2026-10-31",
    today: "2026-11-02",
    lines: oct,
    target,
    traffic: [{ date: "2026-10-01", traffic: 100 }],
    prev: { lines: sep, traffic: [] },
    ly: [line("2025-10-31", "", "Apple", 1170, { lob: "iPhone" })],
    ytd: new Map([
      ["2026-10", oct],
      ["2025-10", [line("2025-10-31", "", "Apple", 1170, { lob: "iPhone" })]],
      ["2026-09", sep],
    ]),
    bnpl: [
      { key: "Kredivo", data: { qty: 2, amount: 400 } },
      { key: "Kredivo", data: { qty: 1, amount: 100 } },
      { key: "HCI", data: { qty: 1, amount: 300 } },
      { key: "Laku6 Master Device", data: { qty: 1, amount: 999 } },
    ],
    ...o,
  };
}

test("closing: whole previous month, group growth, LFL", () => {
  const d = buildReport(input());
  assert.equal(d.mode, "closing");
  assert.equal(d.title, "Closing Oktober 2026");
  assert.equal(d.prevLabel, "September");
  const a = d.groups[0];
  assert.equal(a.group, "Amount");
  assert.equal(a.mtd, 2410);
  assert.equal(a.target, 3100);
  assert.equal(a.mtm, 740);
  assert.ok(Math.abs(a.mtmGrowth! - (2410 / 740 - 1) * 100) < 1e-9);
  assert.equal(a.lfl, 1170);
  const apple = d.groups.find((g) => g.group === "Apple")!;
  assert.equal(apple.mtd, 1900);
  assert.equal(apple.mtm, 500);
});

test("weekly: comparisons cut to the same days", () => {
  const i = input({ asOf: "2026-10-12", today: "2026-10-13" });
  const d = buildReport(i);
  assert.equal(d.mode, "weekly");
  assert.equal(d.title, "Weekly Report W3 Oktober 2026");
  assert.equal(d.curLabel, "1–12 Oktober");
  assert.equal(d.prevLabel, "1–12 September");
  // Sep 25 is outside 1–12, Oct 20/31 are after asOf
  assert.equal(d.groups[0].mtd, 1410);
  assert.equal(d.groups[0].mtm, 540);
  assert.equal(d.weeks.length, 3);
});

test("staff rows: target order, online, var and AirPods split", () => {
  const d = buildReport(input());
  assert.deepEqual(d.staff.map((s) => s.name), ["Adi", "Elvina", "Online*"]);
  const adi = d.staff[0];
  assert.equal(adi.total, 1140); // "ADI" and "Adi" are the same person
  assert.equal(adi.actual.Apple - adi.target.Apple, 1000 - 775);
  const el = d.staff[1];
  assert.equal(el.airpods, 50);
  assert.equal(el.accEx, 20);
  assert.equal(d.staff[2].kind, "online");
  // ACC & VAS: ex-staff of last month goes to "Lainnya"
  const lain = d.accVas.find((r) => r.name === "Lainnya*")!;
  assert.equal(lain.airpodsPrev, 30);
  assert.equal(d.accVas.find((r) => r.name === "Elvina")!.accExPrev, 10);
});

test("android brands follow the target sheet, case-insensitive", () => {
  const d = buildReport(input());
  assert.deepEqual(d.androidBrands, ["Samsung", "Xiaomi"]);
  assert.equal(d.staff[0].android.Xiaomi.value, 100);
  const lobs = d.lob.filter((r) => r.kind === "android").map((r) => r.label);
  assert.deepEqual(lobs, ["Samsung", "Xiaomi"]);
  const ta = d.lob.find((r) => r.kind === "totalAndroid")!;
  assert.equal(ta.cur.value, 400);
  assert.equal(ta.prev.value, 200);
  const tApple = d.lob.find((r) => r.kind === "totalApple")!;
  assert.equal(tApple.cur.value, 1950); // iPhone 1900 + AirPods 50
});

test("weeks, BNPL, balance, YTD", () => {
  const d = buildReport(input());
  assert.equal(d.weeks[0].period, "1-3 Okt");
  assert.equal(d.weeks[0].target, 300); // 3100 / 31 × 3
  assert.equal(d.weeks[4].period, "25-31 Okt");
  assert.equal(d.weeksTotal.period, "1-31 Okt");
  assert.equal(d.bnpl.value, 800); // Laku6 is trade-in, not BNPL
  assert.equal(d.bnpl.rows.find((r) => r.provider === "Kredivo")!.qty, 3);
  assert.ok(Math.abs(d.balance.value![0] - (1900 / 2300) * 100) < 1e-9);
  const okt = d.ytd.find((r) => r.label === "Okt")!;
  assert.equal(okt.cur!.value, 2410);
  assert.equal(okt.prev!.value, 1170);
  assert.equal(d.ytd.find((r) => r.label === "Sep")!.prev, null);
  assert.equal(d.issues.length, 3);
  assert.match(d.issues[0], /Achievement Oktober .* dari target/);
});

test("no previous month: no MTM", () => {
  const d = buildReport(input({ prev: null }));
  assert.equal(d.hasPrev, false);
  assert.equal(d.groups[0].mtm, null);
  assert.equal(d.productivity.prev, null);
});

test("deck builds every slide", async () => {
  const d = buildReport(input());
  const m = defaultManual(d, "Tester - 1");
  m.skip = [];
  m.npi.rows[0].a = 3;
  m.npi.duoTitle = "NPI Duo";
  m.bnpl.per.Kredivo = { a: 1, b: 2 };
  m.feedback[0] = "satu\ndua";
  const deck = buildDeck(PptxGenJS as unknown as new () => PptxGenJS, d, m, null);
  const buf = (await deck.write({ outputType: "nodebuffer" })) as Buffer;
  assert.ok(buf.length > 20_000);
});
