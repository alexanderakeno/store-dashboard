import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDashTarget, parsePromo, parseTracker, parseTrafficTab } from "@/lib/parsers/extras";
import { isDraWorkbook, parseDraWorkbook } from "@/lib/parsers/dra";

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

test("parseDashTarget reads tab Dashboard B6:G17 (title row, header, staff, hidden blank row, Total)", () => {
  const grid = [
    ["", "Target"],
    ["", "Apple", "Android", "Accesories", "VAS", "Total"],
    ["Adi Muhamad Rizki", "649.319.576", "133.180.000", "31.356.309", "36.604.083", "850.459.968"],
    ["Elvina Qur'ani", 1038911322, 213088000, 50170094, 58566533, 1360735949],
    ["Digiplus.co.id", 0, 0, 0, 0, 0],
    [],
    ["Total", "  6.493.195.762 ", "  1.331.800.000 ", "  313.563.088 ", "  366.040.829 ", "  8.504.599.679 "],
  ];
  const t = parseDashTarget(grid)!;
  assert.deepEqual(t.cols, ["Apple", "Android", "Accesories", "VAS", "Total"]);
  assert.deepEqual(t.rows.map((r) => r.name), ["Adi Muhamad Rizki", "Elvina Qur'ani", "Digiplus.co.id"]);
  assert.deepEqual(t.rows[0].values, [649319576, 133180000, 31356309, 36604083, 850459968]);
  assert.deepEqual(t.total, [6493195762, 1331800000, 313563088, 366040829, 8504599679]);
  assert.equal(parseDashTarget([["", "Target"], []]), null);
});

test("DRA workbook: per-store Apple & Android lines, Apple accessory totals, file name info", () => {
  const sheets = [
    { name: "by article", rows: [["Article", "Sales qty", "Stk OnHand", "Detailed Category (Sub-LOB)"], ["APPA", 3, 10, "IPHONE 17"], ["APPCASE", 2, 40, "CASE IPHONE 17"], ["APPZERO", null, null, "X"], ["Total", 5, 50, ""]] },
    { name: "apple by article", rows: [["New Site", "Article", "Article Description", "Detailed Category (Sub-LOB)", "Sales qty", "Stk OnHand"], ["QF10 Digiplus Kota Kasablanka", "APPA", "IPHONE 17 256GB BLACK", "IPHONE 17", 2, 4], ["QF08 Digiplus Gandaria City", "APPA", "IPHONE 17 256GB BLACK", "IPHONE 17", null, 0], ["M118 Digimap PIM", "APPA", "IPHONE 17 256GB BLACK", "IPHONE 17", 1, 6]] },
    { name: "android by article", rows: [["New Site", "BRAND", "Article", "Article Description", "Detailed Category (Sub-LOB)", "Sales qty", "Stk OnHand"], ["QF10 Digiplus Kota Kasablanka", "SAMSUNG", "SMS1", "GALAXY S25 256GB", "Galaxy S25", 1, 3]] },
  ];
  assert.equal(isDraWorkbook(sheets), true);
  const d = parseDraWorkbook(sheets, "MZA DRA Y27Q1W8 as of minggu 22 nov 2026 V1.xlsx");
  assert.equal(d.week, "Y27Q1W8");
  assert.equal(d.asOf, "2026-11-22");
  assert.deepEqual(d.sites, ["QF10 Digiplus Kota Kasablanka", "M118 Digimap PIM"]); // the all-zero Gandaria line is dropped
  assert.deepEqual(d.arts.map((a) => [a[0], a[3], a[4]]), [["APPA", "APPLE", 0], ["SMS1", "SAMSUNG", 1], ["APPCASE", "APPLE", 0]]);
  // QF10 APPA, PIM APPA, QF10 SMS1, network-only APPCASE (APPA is not repeated from "by article", zero rows and Total skipped)
  assert.deepEqual(d.rows, [0, 0, 2, 4, 1, 0, 1, 6, 0, 1, 1, 3, -1, 2, 2, 40]);
  assert.equal(isDraWorkbook([{ name: "Sheet1", rows: [["a"]] }]), false);
});
