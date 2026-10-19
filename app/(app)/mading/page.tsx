import Link from "next/link";
import { appConfig } from "@/config/app";
import { PageIntro, Panel } from "@/components/kit";
import { ParamDate, ParamSelect, PrintButton } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { APPLE_LOBS, VAS_PROVIDERS, clampRange, linesIn, lobQty, lobValue, perfCards, staffStats, timeGonePct, vasSplit } from "@/lib/domain/extra";
import { monthStart } from "@/lib/domain/period";
import { homeView } from "@/lib/domain/views";
import { dec, monthLabel, num, pct, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";

const TONES = ["blue", "violet", "green", "amber"] as const;

export default async function MadingPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Mading" p={p} />;
  const s = p.snap;
  const range = p.q.mode === "range";
  const { from, to } = range ? clampRange(p.month, p.asOf, p.q.from, p.q.to) : { from: monthStart(p.month), to: p.asOf };
  const h = homeView(s, to);
  const cards = perfCards(h);
  const ls = linesIn(s, from, to);
  const staff = staffStats(ls, s.target, timeGonePct(p.month, to));
  const lq = lobQty(ls);
  const lv = lobValue(ls);
  const vs = vasSplit(ls);
  return (
    <div className="sd-content">
      <PageIntro eyebrow={`${appConfig().storeCode || "STORE"} • Mading`} title="Mading Performance" desc="Ringkasan performa store, staff, LOB dan VAS." actions={<PrintButton />} />
      <section className="sd-panel space-y-4 p-5">
        <div className="inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          <Link href={withQuery("/mading", p.q, { mode: null, from: null, to: null })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${!range ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Bulan</Link>
          <Link href={withQuery("/mading", p.q, { mode: "range" })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${range ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Range Tanggal</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ParamSelect param="m" label="Bulan" value={p.month} reset={["d", "from", "to"]} options={p.months.map((m) => ({ value: m.month, label: monthLabel(m.month) }))} />
          {range && <ParamDate param="from" label="Dari" value={from} min={monthStart(p.month)} max={p.asOf} />}
          {range && <ParamDate param="to" label="Sampai" value={to} min={monthStart(p.month)} max={p.asOf} />}
        </div>
        <p className="text-xs text-slate-500">Periode aktif: <b>{range ? `${from} s/d ${to}` : p.month}</b></p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, i) => (
          <article key={c.key} className="sd-block-card p-5" data-tone={TONES[i]}>
            <p className="text-xs font-black tracking-[.08em] text-slate-500 uppercase">{c.key === "total" ? "Amount" : c.label}</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{rpf(c.actual)}</p>
            <div className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-[13px] dark:border-slate-700">
              <div className="flex justify-between"><span className="text-slate-500">Target {rpf(c.target)}</span><b>{pct(c.achievementPct ?? 0, 0)}</b></div>
              <div className="flex justify-between"><span className="whitespace-nowrap text-blue-600">Est. {rpf(c.estimate)}</span><b className="whitespace-nowrap">{dec(c.points, 1)}/{c.pointsMax} pts</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Variance</span><b className={c.variance >= 0 ? "text-emerald-600" : "text-rose-600"}>{rpf(c.variance)}</b></div>
            </div>
          </article>
        ))}
      </div>
      {range && <p className="-mt-2 text-xs text-slate-500">Kartu di atas = MTD s/d {to}; tabel di bawah mengikuti range tanggal.</p>}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Pencapaian Staff • Value">
          <div className="sd-table-wrap"><table className="sd-table">
            <thead><tr><th>Staff</th><th className="n">Value</th><th className="n">Target</th><th className="n">%</th></tr></thead>
            <tbody>{staff.map((r) => <tr key={r.key}><td className="font-bold">{r.name}</td><td className="n">{rpf(r.totals.sales)}</td><td className="n">{rpf(r.target)}</td><td className="n">{pct(r.achievementPct ?? 0, 0)}</td></tr>)}</tbody>
          </table></div>
        </Panel>
        <div className="space-y-5">
          <Panel title="LOB Apple • Qty / Value">
            <div className="sd-table-wrap"><table className="sd-table">
              <thead><tr><th>LOB</th><th className="n">Qty</th><th className="n">Value</th></tr></thead>
              <tbody>{APPLE_LOBS.map((k) => <tr key={k}><td className="font-bold">{k}</td><td className="n">{num(lq[k])}</td><td className="n">{rpf(lv[k])}</td></tr>)}</tbody>
            </table></div>
          </Panel>
          <Panel title="VAS • Qty / Value">
            <div className="sd-table-wrap"><table className="sd-table">
              <thead><tr><th>Provider</th><th className="n">Qty</th><th className="n">Value</th></tr></thead>
              <tbody>{VAS_PROVIDERS.map((k) => <tr key={k}><td className="font-bold">{k}</td><td className="n">{num(vs[k].qty)}</td><td className="n">{rpf(vs[k].value)}</td></tr>)}</tbody>
            </table></div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
