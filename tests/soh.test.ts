import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSohPdf, type PdfText } from "@/lib/parsers/soh";
import { sohRows } from "@/lib/domain/soh";
import type { SalesLine } from "@/types/domain";

/** Synthetic SOH page laid out like the Sales Dashboard V6 PDF: side-by-side blocks, tiny scaled units. */
function page(): PdfText[] {
  const t = (str: string, x: number, y: number, h = 1.4): PdfText => ({ page: 1, str, x, y, w: str.length * 0.7, h });
  const out: PdfText[] = [t("STORE - DEMO", 55.8, 553.3, 2.4), t("Stock On Hand", 55.9, 543.3, 3.6), t("Date Updated", 58, 539.6), t("13/10/2026", 82.1, 539.6)];
  const blocks: Array<[string, number, Array<[string, string, string]>, string]> = [
    ["Phone A", 55.7, [["SYN-P-01", "PHONE DEMO 128GB", "2"], ["SYN-P-02", "PHONE DEMO 256GB", "10"]], "12"],
    ["Tablet B", 113.9, [["SYN-T-01", "TABLET DEMO WIFI", "1"]], "1"],
    ["Brand C", 172.1, [["SYN-C-01", "WATCH DEMO", "3"], ["SYN-C-02", "BAND DEMO", "1"], ["SYN-C-03", "BUDS DEMO", "5"]], "9"],
  ];
  for (const [cat, x, rows, total] of blocks) {
    out.push(t(cat, x, 535.1, 1.6), t("Article", x + 4.4, 531.5), t("Description", x + 26.4, 531.5), t("Qty", x + 48.1, 531.5));
    out.push(t("Grand Total", x + 19.7, 529.9), t(total, x + 48.1, 529.4));
    rows.forEach(([a, d, q], i) => out.push(t(a, x, 527.4 - i * 2.1), t(d, x + 13.4, 527.4 - i * 2.1), t(q, x + 48.8, 527.4 - i * 2.1)));
  }
  return out.sort(() => 0.5 - Math.random()); // pdf.js order is not guaranteed
}

test("SOH PDF: blocks, articles, date and grand totals", () => {
  const r = parseSohPdf(page());
  assert.equal(r.date, "2026-10-13");
  assert.equal(r.title, "STORE - DEMO");
  assert.deepEqual(r.categories, ["Phone A", "Tablet B", "Brand C"]);
  assert.equal(r.items.length, 6);
  assert.deepEqual(r.items.filter((x) => x.category === "Phone A"), [
    { category: "Phone A", article: "SYN-P-01", description: "PHONE DEMO 128GB", qty: 2 },
    { category: "Phone A", article: "SYN-P-02", description: "PHONE DEMO 256GB", qty: 10 },
  ]);
  assert.deepEqual(r.totals, { "Phone A": 12, "Tablet B": 1, "Brand C": 9 });
  assert.deepEqual(r.warnings, []);
});

test("SOH PDF: grand total mismatch and non-SOH files are reported", () => {
  const p = page().map((x) => (x.str === "12" ? { ...x, str: "13" } : x));
  assert.match(parseSohPdf(p).warnings[0], /Phone A: total artikel 12 ≠ Grand Total 13/);
  const none = parseSohPdf([{ page: 1, str: "Invoice", x: 1, y: 1, w: 1, h: 1 }]);
  assert.equal(none.items.length, 0);
  assert.match(none.warnings[0], /tidak ditemukan/);
});

test("SOH rows: month-to-date sold by article and balance", () => {
  const line = (article: string, date: string, qty: number) => ({ article, date, qty }) as SalesLine;
  const items = [
    { category: "X", article: "A1", description: "", qty: 2 },
    { category: "X", article: "A2", description: "", qty: 100 },
    { category: "X", article: "A3", description: "", qty: 5 },
  ];
  const lines = [line("a1", "2026-10-02", 3), line("A1", "2026-10-04", -1), line("A1", "2026-10-12", 9), line("A2", "2026-10-05", 1), line("A3", "2026-10-09", 10)];
  const [a1, a2, a3] = sohRows(items, lines, "2026-10-10");
  assert.equal(a1.sold, 2); // after as-of excluded, return nets out
  assert.equal(a1.balance, "ok"); // 2 ÷ (2/10 per day) = 10 days
  assert.equal(a2.balance, "slow");
  assert.equal(a3.balance, "low");
  assert.equal(sohRows([{ ...items[0], article: "ZZ" }], lines, "2026-10-10")[0].balance, "unsold");
});
