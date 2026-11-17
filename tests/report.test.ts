import { test } from "node:test";
import assert from "node:assert/strict";
import PptxGenJS from "pptxgenjs";
import { buildReport, type ReportInput } from "@/lib/domain/report";
import { bnplRows, buildDeck, defaultManual, fitFont, fontFor, rowsIn } from "@/lib/report/pptx";
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
    line("2026-10-31", "Digiplus.co.id", "ACC", 5, { nik: "999", lob: null }),
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
  assert.equal(a.mtd, 2415);
  assert.equal(a.target, 3100);
  assert.equal(a.mtm, 740);
  assert.ok(Math.abs(a.mtmGrowth! - (2415 / 740 - 1) * 100) < 1e-9);
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
  // a channel name with a NIK still counts as online, not as a staff row
  assert.equal(d.staff[2].total, 905);
  assert.equal(d.staff.length, 3);
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
  assert.equal(okt.cur!.value, 2415);
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

test("first names on the slides; BNPL typed in the pop-up", () => {
  const t = { ...target, staff: [{ ...target.staff[0], name: "Adi Muhamad Rizki" }, { ...target.staff[1], name: "Elvina Qurani" }] };
  const i = input({ target: t, bnpl: [] });
  i.lines = i.lines.map((l) => (l.staffName === "ADI" || l.staffName === "Adi" ? { ...l, staffName: "ADI MUHAMAD RIZKI" } : l.staffName === "Elvina" ? { ...l, staffName: "Elvina Qurani" } : l));
  const d = buildReport(i);
  assert.deepEqual(d.staff.map((s) => s.name), ["Adi", "Elvina", "Online*"]);
  assert.equal(d.staff[0].total, 1140);
  const m = defaultManual(d, "");
  assert.ok(m.skip.includes("bnpl"));
  m.bnpl.per.Kredivo = { a: 1, b: 2, value: 473769285, qty: 24 };
  const b = bnplRows(d, m);
  assert.equal(b.value, 473769285);
  assert.equal(b.qty, 24);
});

test("PPT tables fit the slide: rows never forced taller than the space, font fits row and column", () => {
  // 22 rows (Android/Apple split slide with 9 staff) in the 4.93" left under the title
  const { rowH, fontSize } = rowsIn(22, 4.93, 0.36);
  assert.ok(rowH * 22 <= 4.93 + 1e-9);
  assert.ok((fontSize * 1.2) / 72 + 0.04 <= rowH); // one line + cell margins fits the row
  assert.equal(fontFor(0.62), 16);
  // a long negative variance in a 1.27" column shrinks the font instead of wrapping
  const cell = { text: "(2.863.582.357)", options: { bold: true } };
  const fs = fitFont([[cell]], [1.27], 11, 0.05);
  assert.ok(fs < 11 && fs >= 7);
  assert.equal(fitFont([[{ text: "Adi" }]], [1.6], 14, 0.09), 14);
});

test("PPT: many staff → readable fonts on extra slides, nothing past the bottom margin", async () => {
  const names = ["Adi", "Elvina", "Chelsy", "Flora", "Imam", "Sulaiman", "Sarah", "Rizki", "Dewi", "Bima"];
  const t = { ...target, staff: names.map((name) => ({ ...target.staff[0], name, sharePct: 0.1 })) };
  const d = buildReport(input({ target: t }));
  const m = defaultManual(d, "Tester");
  m.skip = [];
  const deck = buildDeck(PptxGenJS as unknown as new () => PptxGenJS, d, m, null);
  const buf = (await deck.write({ outputType: "nodebuffer" })) as Buffer;
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  let cont = 0;
  for (const f of slides) {
    const x = await zip.file(f)!.async("string");
    if (x.includes("(lanjutan)")) cont++;
    for (const g of x.matchAll(/<p:graphicFrame>([\s\S]*?)<\/p:graphicFrame>/g)) {
      const y = Number(/<a:off x="-?\d+" y="(\d+)"/.exec(g[1])![1]);
      const h = [...g[1].matchAll(/<a:tr h="(\d+)"/g)].reduce((a, r) => a + Number(r[1]), 0);
      assert.ok((y + h) / 914400 <= 6.96, `${f} table ends at ${((y + h) / 914400).toFixed(2)}"`);
      const sizes = [...g[1].matchAll(/sz="(\d+)"/g)].map((r) => Number(r[1]) / 100);
      assert.ok(Math.min(...sizes) >= 11, `${f} font ${Math.min(...sizes)}pt ${[...g[1].matchAll(/<a:t>(.*?)<\/a:t>/g)].map((r) => r[1]).slice(0, 40).join("|")}`);
    }
  }
  assert.ok(cont >= 1, "continuation slides");
});

test("stock kosong filter: days, sold, top per brand, hidden brands", async () => {
  const { stockRows, stockSlides, STOCK_FILTER } = await import("../lib/report/pptx");
  const it = (a: string, sold: number, days: number) => ({ article: a, description: a, sold, lastSold: "2026-11-01", days, alt: [] });
  const d = { stockOut: { sohDate: "2026-11-15", from: "2026-10-17", to: "2026-11-15", groups: [
    { category: "iPhone", items: [it("A", 5, 20), it("B", 3, 8), it("C", 1, 3), it("D", 2, 15)] },
    { category: "Oppo", items: [it("E", 1, 9)] },
  ] } } as unknown as Parameters<typeof stockRows>[0];
  assert.deepEqual(stockRows(d, STOCK_FILTER).map((g) => [g.category, g.items.map((i) => i.article)]), [["iPhone", ["A", "B", "D"]], ["Oppo", ["E"]]]);
  assert.deepEqual(stockRows(d, { ...STOCK_FILTER, minDays: 14, minSold: 2 }).map((g) => g.items.map((i) => i.article)), [["A", "D"]]);
  const top = stockRows(d, { ...STOCK_FILTER, perBrand: 1, hide: ["Oppo"] });
  assert.deepEqual(top.map((g) => [g.category, g.total, g.items.length]), [["iPhone", 3, 1]]);
  assert.equal(stockSlides(top), 1);
});

test("weekly template: week vs the week before, like-for-like while running, own deck", async () => {
  const { deckWeek, deckFileName, buildDeck } = await import("@/lib/report/pptx");
  const d = buildReport(input({ asOf: "2026-10-12", today: "2026-10-13" }));
  assert.deepEqual(d.wow.map((w) => [w.label, w.prevLabel, w.period, w.running, w.days]), [
    ["W1", "W5 Sep", "1-3 Okt", false, 3],
    ["W2", "W1", "4-10 Okt", false, 7],
    ["W3", "W2", "11-17 Okt", true, 2],
  ]);
  const [w1, w2, w3] = d.wow;
  assert.equal(w1.cur.sales, 1370);
  assert.equal(w1.prev?.sales, 0);
  assert.equal(w2.prev?.sales, 1370);
  assert.equal(w3.cur.sales, 40);
  // the week target is the month target spread over the days of the week
  assert.equal(Math.round(w2.target), 700);
  assert.equal(w3.daily.length, 7);
  assert.equal(w3.daily[0].prevDate, "2026-10-04");
  assert.ok(w3.daily[3].future);
  assert.equal(w2.staff.find((s) => s.name === "Adi")?.prev, 1000);
  assert.match(w3.issues[0], /Sales W3 \(11-17 Okt\)/);
  const m = { ...defaultManual(d, "x"), template: "weekly" as const };
  // default week: the last finished one
  assert.equal(deckWeek(d, m)?.label, "W2");
  assert.equal(deckFileName(d, m), "QF10 Weekly Report W2 vs W1 Oktober 2026.pptx");
  assert.equal(deckFileName(d, { ...m, week: 3 }), "QF10 Weekly Report W3 vs W2 Oktober 2026.pptx");
  const p = buildDeck(PptxGenJS as unknown as new () => PptxGenJS, d, m, null) as unknown as { _slides: unknown[] };
  assert.ok(p._slides.length >= 8);
});
