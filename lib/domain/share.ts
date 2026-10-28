import { dateLong, dec, num, pct, rp } from "@/lib/format";
import type { SalesLine } from "@/types/domain";
import { VAS_PROVIDERS, lobBreakdown, vasSplit } from "./extra";
import type { HomeView } from "./views";

const LOB_NAME: Record<string, string> = { Mac: "MacBook" };

/**
 * Plain-text daily summary for WhatsApp (Share Daily / Salin Teks). Laid out for a phone chat bubble:
 * short lines (one figure per line), bold section headers, bullets per group, blank lines between
 * sections — so nothing wraps mid-sentence when pasted into WhatsApp.
 */
export function shareText(h: HomeView, storeName: string, lines: SalesLine[] = []): string {
  const L: string[] = [];
  const day = Number(h.asOf.slice(8, 10));
  const tg = h.daysInMonth ? (h.daysElapsed / h.daysInMonth) * 100 : null;

  L.push(`*${storeName || "Store"}*`);
  L.push(`*Daily Report — ${dateLong(h.asOf)}*`);
  L.push("");

  L.push("*HARI INI*");
  L.push(`Sales: ${rp(h.day.totals.sales)}`);
  L.push(`Target: ${rp(h.day.achievement.target)} (${pct(h.day.achievement.achievementPct, 0)})`);
  L.push(`Invoice ${num(h.day.totals.invoices)} · Qty ${num(h.day.totals.qty)} · UPT ${dec(h.day.totals.upt)}`);
  L.push("");

  // today's breakdown: Apple per LOB (AirPods included), Android per brand, ACC, VAS per provider
  const today = lines.filter((l) => l.date === h.day.date);
  if (today.length) {
    const b = lobBreakdown(today);
    const sum = (r: Record<string, { qty: number; value: number }>) => Object.values(r).reduce((t, x) => ({ qty: t.qty + x.qty, value: t.value + x.value }), { qty: 0, value: 0 });
    const block = (title: string, total: { qty: number; value: number }, items: Array<[string, { qty: number; value: number }]>) => {
      L.push(`*${title}*: ${rp(total.value)}${total.qty ? ` (${num(total.qty)} unit)` : ""}`);
      for (const [k, v] of items) if (v.qty || v.value) L.push(`• ${k}: ${num(v.qty)} · ${rp(v.value)}`);
    };
    L.push("*RINCIAN HARI INI*");
    block("Apple", sum(b.apple), Object.entries(b.apple).map(([k, v]) => [LOB_NAME[k] ?? k, v]));
    block("Android", sum(b.android), Object.entries(b.android).sort((x, y) => y[1].value - x[1].value));
    L.push(`*ACC*: ${rp(b.acc.value)}${b.acc.qty ? ` (${num(b.acc.qty)} unit)` : ""}`);
    const v = vasSplit(today);
    block("VAS", b.vas, VAS_PROVIDERS.map((k) => [k, v[k]]));
    L.push("");
  }

  L.push(`*MTD (1–${day})*`);
  L.push(`Sales: ${rp(h.totals.sales)}`);
  L.push(`Target: ${rp(h.achievement.target)}`);
  L.push(`Ach: ${pct(h.achievement.achievementPct)} · TG ${pct(tg)}`);
  L.push(`Gap: ${rp(h.achievement.gap)}`);
  L.push(`Est. closing: ${rp(h.estimate)} (${pct(h.estimatePct)})${h.estimateStable ? "" : " _belum stabil_"}`);
  L.push("");

  L.push("*PER GRUP (MTD)*");
  for (const g of h.groups) {
    L.push(`• *${g.group}*: ${rp(g.actual)}`);
    L.push(`   ${pct(g.achievementPct, 0)} · ${dec(g.point, 1)}/${g.pointCap} pt`);
  }
  L.push(`*Point: ${dec(h.points.total, 1)}/${h.points.max}* (est. ${dec(h.points.estimateTotal, 1)})`);
  L.push("");

  L.push("*TRANSAKSI (MTD)*");
  L.push(`Invoice ${num(h.totals.invoices)} · Qty ${num(h.totals.qty)}`);
  L.push(`UPT ${dec(h.totals.upt)} · ATV ${rp(h.totals.atv)}`);
  if (h.cvr.cvr != null) L.push(`CVR ${pct(h.cvr.cvr)} (traffic ${num(h.cvr.traffic)})`);
  if (h.ar.ar != null) L.push(`AR Qoala ${pct(h.ar.ar)}`);
  return L.join("\n");
}
