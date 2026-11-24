import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRows, dmySlash, fileName, mainMonth, normalizeExtract, numForm, rpForm, shortDate, totals, type PcRow } from "@/lib/domain/pettyCash";

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
