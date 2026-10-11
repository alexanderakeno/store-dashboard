import { appConfig } from "@/config/app";
import { EmptyBlock, NeedData, PageIntro, Panel } from "@/components/kit";
import { ParamSelect } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { staffStats, typeQty } from "@/lib/domain/extra";
import { totals } from "@/lib/domain/kpi";
import { daysInMonth, eachDay, weeksOfMonth } from "@/lib/domain/period";
import { dateShort, num, pct, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";

export default async function WeeklyReasonPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Weekly Reason" p={p} />;
  const s = p.snap;
  const weeks = weeksOfMonth(p.month).filter((w) => w.start <= p.asOf);
  const wk = weeks.find((w) => String(w.index) === p.q.wk) ?? weeks[weeks.length - 1];
  const end = wk.end < p.asOf ? wk.end : p.asOf;
  const ls = s.lines.filter((l) => l.date >= wk.start && l.date <= end);
  const t = totals(ls);
  const days = eachDay(wk.start, wk.end).length;
  const scale = days / daysInMonth(p.month);
  const tg = (eachDay(wk.start, end).length / days) * 100;
  const target = (s.target?.total ?? 0) * scale;
  const staff = staffStats(ls, s.target, tg, { targetScale: scale });
  const moves = typeQty(ls).sort((a, b) => b.qty - a.qty).slice(0, 10);
  return (
    <div className="sd-content">
      <PageIntro eyebrow={`${appConfig().storeCode || "STORE"} Reporting`} title="Weekly Reason" desc="Weekly sales actual, reason staff, product movement dan kondisi SOH." />
      <section className="sd-panel grid gap-3 p-5 sm:grid-cols-2">
        <ParamSelect param="wk" label="Pilih Week" value={String(wk.index)} options={weeks.map((w) => ({ value: String(w.index), label: `${w.label} · ${dateShort(w.start)}–${dateShort(w.end)}` }))} />
        <div className="self-end text-sm text-slate-500">Sales {rpf(t.sales)} / target {rpf(target)} · <b>{pct(target ? (t.sales / target) * 100 : null, 0)}</b> · time gone week {pct(tg, 0)}</div>
      </section>
      <Panel title="Weekly Sales & Reason Staff" right={<NeedData label="Reason: Need Data" />}>
        <div className="sd-table-wrap"><table className="sd-table">
          <thead><tr><th>Staff</th><th className="n">Target Week</th><th className="n">Actual</th><th className="n">%</th><th>Status</th><th>Reason</th></tr></thead>
          <tbody>{staff.map((r) => (
            <tr key={r.key}><td className="font-bold">{r.name}</td><td className="n">{rpf(r.target)}</td><td className="n">{rpf(r.totals.sales)}</td><td className="n">{pct(r.achievementPct ?? 0, 0)}</td>
              <td><span className={`sd-badge ${r.onPace ? "green" : "red"}`}>{r.onPace ? "On Track" : "Behind"}</span></td>
              <td><input className="sd-input !min-h-8 text-sm" disabled placeholder="Isi alasan…" aria-label={`Reason ${r.name}`} /></td></tr>
          ))}</tbody>
        </table></div>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Product Movement" desc="Top 10 type Apple (qty) minggu ini.">
          <div className="sd-table-wrap"><table className="sd-table">
            <thead><tr><th>Type</th><th className="n">Qty</th><th className="n">Value</th></tr></thead>
            <tbody>{moves.map((m) => <tr key={m.type}><td className="font-bold">{m.type}</td><td className="n">{num(m.qty)}</td><td className="n">{rpf(m.value)}</td></tr>)}
              {!moves.length && <tr><td colSpan={3} className="text-center text-slate-500">Belum ada penjualan.</td></tr>}</tbody>
          </table></div>
        </Panel>
        <Panel title="Kondisi SOH">
          <EmptyBlock title="Kondisi SOH">Butuh file SOH (stock on hand) per artikel — upload di Data Upload setelah format disepakati.</EmptyBlock>
        </Panel>
      </div>
    </div>
  );
}
