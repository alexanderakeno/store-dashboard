import { GROUPS, type MerchLine, type ReconcileIssue, type SalesLine } from "@/types/domain";
import { byStaff, invoices, totals } from "./kpi";
import { reconcileQty } from "./qty";

const TOLERANCE = 1; // Rp

/** Consistency checks shown in Cut Off / Settings. Never throws. */
export function reconcile(lines: SalesLine[], merch: MerchLine[]): ReconcileIssue[] {
  const issues: ReconcileIssue[] = [];
  const t = totals(lines);

  const merchNet = merch.reduce((a, m) => a + m.net, 0);
  if (merch.length && Math.abs(merchNet - t.sales) > TOLERANCE)
    issues.push({ check: "MR vs SP", severity: "error", detail: "Total Merchandise Report ≠ total Sales Person", expected: merchNet, actual: t.sales });

  const groupSum = GROUPS.reduce((a, g) => a + t.byGroup[g], 0);
  if (Math.abs(groupSum - t.sales) > TOLERANCE)
    issues.push({ check: "Grup", severity: "error", detail: "Apple + Android + ACC + VAS ≠ total", expected: t.sales, actual: groupSum });

  const { staff, channels } = byStaff(lines, null);
  const people = [...staff, ...channels];
  const staffSales = people.reduce((a, s) => a + s.totals.sales, 0);
  const staffQty = people.reduce((a, s) => a + s.totals.qty, 0);
  if (Math.abs(staffSales - t.sales) > TOLERANCE)
    issues.push({ check: "Staff sales", severity: "error", detail: "Σ sales staff + channel ≠ total toko", expected: t.sales, actual: staffSales });
  if (staffQty !== t.qty) issues.push({ check: "Staff qty", severity: "error", detail: "Σ qty staff ≠ qty toko", expected: t.qty, actual: staffQty });

  const inv = invoices(lines);
  if (inv.length !== t.invoices) issues.push({ check: "Invoice", severity: "error", detail: "Detail invoice ≠ jumlah invoice", expected: t.invoices, actual: inv.length });

  const sharedInvoices = new Map<string, Set<string>>();
  for (const l of lines) {
    if (!l.invoice) continue;
    const s = sharedInvoices.get(l.invoice) ?? new Set<string>();
    s.add(l.nik ?? l.staffName);
    sharedInvoices.set(l.invoice, s);
  }
  const multi = [...sharedInvoices.entries()].filter(([, s]) => s.size > 1);
  if (multi.length)
    issues.push({ check: "Invoice multi-staff", severity: "warning", detail: `${multi.length} invoice tercatat di lebih dari satu staff (dihitung 1× di toko, 1× per staff)` });

  // MR aggregates paid + free units per day; SP has one line per unit/price. Compare all units of Qty-counted articles.
  const qtyArticles = new Set(lines.filter((l) => l.countsInQty).map((l) => l.article));
  const paidMismatch = reconcileQty(
    merch.filter((m) => qtyArticles.has(m.article)),
    lines.filter((l) => l.countsInQty).map((l) => ({ article: l.article, qty: l.qty })),
  );
  if (paidMismatch.length)
    issues.push({ check: "Qty inferensi", severity: "warning", detail: `${paidMismatch.length} artikel qty hasil inferensi berbeda dengan Merchandise Report: ${paidMismatch.slice(0, 5).map((m) => `${m.article} (${m.salesQty}/${m.merchQty})`).join(", ")}` });

  const uncertain = lines.filter((l) => l.qtySource === "uncertain").length;
  if (uncertain) issues.push({ check: "Qty tidak pasti", severity: "info", detail: `${uncertain} baris harga tidak cocok dengan harga satuan (diskon) — dihitung 1 unit` });

  return issues;
}
