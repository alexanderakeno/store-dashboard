import { dateLong, dec, num, pct, rp } from "@/lib/format";
import type { HomeView } from "./views";

/** Plain-text daily summary for WhatsApp (Share Daily). */
export function shareText(h: HomeView, storeName: string): string {
  const L: string[] = [];
  L.push(`*${storeName || "Store"} — Daily Report*`);
  L.push(dateLong(h.asOf));
  L.push("");
  L.push(`*Hari ini*: ${rp(h.day.totals.sales)} (${pct(h.day.achievement.achievementPct)} dari target harian)`);
  L.push(`Invoice ${num(h.day.totals.invoices)} · Qty ${num(h.day.totals.qty)} · UPT ${dec(h.day.totals.upt)}`);
  L.push("");
  L.push(`*MTD*: ${rp(h.totals.sales)} / ${rp(h.achievement.target)} (${pct(h.achievement.achievementPct)})`);
  L.push(`Gap: ${rp(h.achievement.gap)}`);
  L.push(`Est. closing: ${rp(h.estimate)} (${pct(h.estimatePct)})${h.estimateStable ? "" : " — belum stabil"}`);
  L.push("");
  for (const g of h.groups) L.push(`${g.group}: ${rp(g.actual)} (${pct(g.achievementPct)}) · pt ${dec(g.point, 1)}/${g.pointCap}`);
  L.push(`*Point*: ${dec(h.points.total, 1)}/${h.points.max} (est. ${dec(h.points.estimateTotal, 1)})`);
  L.push("");
  L.push(`Invoice ${num(h.totals.invoices)} · Qty ${num(h.totals.qty)} · UPT ${dec(h.totals.upt)} · ATV ${rp(h.totals.atv)}`);
  if (h.cvr.cvr != null) L.push(`CVR ${pct(h.cvr.cvr)} (traffic ${num(h.cvr.traffic)})`);
  if (h.ar.ar != null) L.push(`AR Qoala ${pct(h.ar.ar)}`);
  return L.join("\n");
}
