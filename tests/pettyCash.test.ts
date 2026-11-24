import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRows, dmySlash, fileName, flagOtherMonth, mainMonth, normalizeExtract, numForm, rowsFromPages, rpForm, shortDate, totals, type PcRow } from "@/lib/domain/pettyCash";

const row = (date: string, amount: number, account: PcRow["account"] = "sundries", description = "x"): PcRow => ({ id: date + amount, date, pcv: "", description, account, amount, pages: [] });

test("petty cash formatting matches the QF10 form", () => {
  assert.equal(rpForm(1604785), "Rp1.604.785");
  assert.equal(rpForm(0), "Rp0");
  assert.equal(numForm(500000), "500.000");
  assert.equal(dmySlash("2026-10-02"), "02/10/2026");
  assert.equal(shortDate("2026-10-30"), "30-Okt");
  assert.equal(fileName("QF10", "2026-10"), "Pettycash_QF10_Oktober_2026.pdf");
});

test("rows: sorted by date, empty dropped, totals per account", () => {
  const rs = cleanRows([row("2026-10-29", 175757), row("2026-10-02", 30983), { ...row("", 0), description: " " }, row("2026-10-11", 5000, "transport")]);
  assert.deepEqual(rs.map((r) => r.date), ["2026-10-02", "2026-10-11", "2026-10-29"]);
  const t = totals(rs);
  assert.equal(t.grand, 211740);
  assert.equal(t.byAccount.transport, 5000);
  assert.equal(t.byAccount.sundries, 206740);
  assert.equal(mainMonth([row("2026-09-30", 1), row("2026-10-01", 1), row("2026-10-02", 1)], "2026-11"), "2026-10");
  assert.equal(mainMonth([], "2026-11"), "2026-11");
});

test("AI output is normalized and never trusted blindly", () => {
  const a = normalizeExtract({ isReceipt: true, date: "2026-10-28", merchant: "Snapy", items: "Plastik laminating + print color A4", total: "47,152", account: "sundries", confident: true });
  assert.deepEqual(a, { isReceipt: true, date: "2026-10-28", description: "Plastik laminating + print color A4 (Snapy)", account: "sundries", amount: 47152, uncertain: false });
  const b = normalizeExtract({ date: "28/10/2026", total: -5, account: "hack" });
  assert.equal(b.date, "");
  assert.equal(b.amount, 0);
  assert.equal(b.account, "sundries");
  assert.equal(b.uncertain, true);
  assert.equal(normalizeExtract({ isReceipt: false }).isReceipt, false);
  assert.equal(normalizeExtract(null).amount, 0);
});

test("AI never picks the account: every row is Sundries like the QF10 form", () => {
  assert.equal(normalizeExtract({ date: "2026-10-16", merchant: "Paperclip", items: "Tape dispenser Kenko", total: 111000, account: "stationery" }).account, "sundries");
});

test("pages → rows: continuation pages and repeated pages of one invoice are attached, errors flagged", () => {
  let n = 0;
  const id = () => `r${++n}`;
  const ok = (date: string, description: string, amount: number, uncertain = false) => ({ isReceipt: true, date, description, amount, uncertain });
  const rows = rowsFromPages(
    [
      { pageId: "p1", read: ok("2026-10-02", "Sticker A3 matte + print color A3 (Snapy)", 30983) },
      { pageId: "p2", read: ok("2026-10-09", "Tas spunbond goodie bag (Shopee)", 195395) },
      { pageId: "p3", read: { isReceipt: false, date: "", description: "", amount: 0, uncertain: false } }, // invoice page 2
      { pageId: "p4", read: ok("2026-10-09", "", 195395) }, // same invoice again
      { pageId: "p5", read: { error: "AI error 503" } },
      { pageId: "p6", read: ok("2026-10-27", "Tas spunbond goodie bag (Shopee)", 206072) },
    ],
    id,
  );
  assert.deepEqual(rows.map((r) => [r.date, r.amount, r.pages.join("+"), r.account, !!r.uncertain]), [
    ["2026-10-02", 30983, "p1", "sundries", false],
    ["2026-10-09", 195395, "p2+p3+p4", "sundries", false],
    ["", 0, "p5", "sundries", true],
    ["2026-10-27", 206072, "p6", "sundries", false],
  ]);
  assert.equal(rows[2].note, "gagal dibaca");
});

test("a receipt from another month is highlighted, not dropped", () => {
  const rows = flagOtherMonth([row("2026-10-02", 30983), row("2026-09-02", 226000), row("2026-10-30", 120000)]);
  assert.deepEqual(rows.map((r) => [r.date, !!r.uncertain, r.note ?? ""]), [
    ["2026-10-02", false, ""],
    ["2026-09-02", true, "beda bulan (02/09/2026)"],
    ["2026-10-30", false, ""],
  ]);
});

test("Oktober file from the dashboard: misread years fixed, 2-page Shopee invoice completed, September flagged", () => {
  let n = 0;
  const ok = (date: string, description: string, amount: number) => ({ isReceipt: true, date, description, amount, uncertain: false });
  const rows = flagOtherMonth(
    rowsFromPages(
      [
        { pageId: "paperclip", read: ok("2024-10-30", "Double tape foam 3M (Paperclip)", 120000) },
        { pageId: "transmart", read: ok("2025-10-11", "Tisu, pengharum, Baygon, pembersih kaca & lantai (Transmart)", 173301) },
        { pageId: "shopee-lemari", read: ok("2026-09-07", "Lemari sepatu kain (Shopee)", 69935) },
        { pageId: "shopee-amplop", read: ok("2026-10-27", "Amplop coklat + spidol whiteboard (Shopee)", 98725) },
        { pageId: "snapy-28", read: ok("2026-10-28", "Plastik laminating + print color A4 (Snapy)", 47152) },
        { pageId: "snapy-29", read: ok("2026-10-29", "Print color A3 (Snapy)", 175757) },
        { pageId: "shopee-tas-1", read: ok("2026-10-09", "Tas spunbond goodie bag (Shopee)", 0) },
        { pageId: "shopee-tas-2", read: ok("", "", 195395) },
      ],
      () => `r${++n}`,
    ),
  );
  assert.deepEqual(rows.map((r) => [r.date, r.amount, r.pages.length, !!r.uncertain, r.note ?? ""]), [
    ["2026-10-30", 120000, 1, false, "tahun dikoreksi (terbaca 2024)"],
    ["2026-10-11", 173301, 1, false, "tahun dikoreksi (terbaca 2025)"],
    ["2026-09-07", 69935, 1, true, "beda bulan (07/09/2026)"],
    ["2026-10-27", 98725, 1, false, ""],
    ["2026-10-28", 47152, 1, false, ""],
    ["2026-10-29", 175757, 1, false, ""],
    ["2026-10-09", 195395, 2, false, ""],
  ]);
  assert.ok(rows.every((r) => r.account === "sundries"));
});
