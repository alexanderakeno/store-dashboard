import Link from "next/link";
import { NeedData, Panel, Trend, numClass } from "@/components/kit";
import { LineChart, ParamDate, ParamSelect } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { APPLE_LOBS, VAS_PROVIDERS, clampRange, dayRows, deviceOf, linesIn, lobQty, rangeConversion, typeQty } from "@/lib/domain/extra";
import { totals } from "@/lib/domain/kpi";
import { daysInMonth, eachDay, monthStart, prevMonth } from "@/lib/domain/period";
import { dateShort, dayName, dec, monthLabel, num, pct, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";
import { getMonthSnapshot } from "@/lib/services/dashboard";

const LOB_LABEL: Record<string, string> = { iPhone: "iPhone", Mac: "MacBook", iPad: "iPad", "Apple Watch": "Apple Watch", AirPods: "AirPods" };

export default async function DailySummaryPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Daily Summary" p={p} />;
  const s = p.snap;
  const range = p.q.mode === "range";
  const { from, to } = range ? clampRange(p.month, p.asOf, p.q.from, p.q.to) : { from: monthStart(p.month), to: p.asOf };
  const ls = linesIn(s, from, to);
  const t = totals(ls);
  const days = eachDay(from, to).length;
  const target = ((s.target?.total ?? 0) / daysInMonth(p.month)) * (range ? days : daysInMonth(p.month));
  const ach = target ? (t.sales / target) * 100 : null;
  const conv = rangeConversion(s, from, to);
  const rows = dayRows(s, from, to);
  const best = [...rows].sort((a, b) => b.totals.sales - a.totals.sales)[0];
  const low = [...rows].sort((a, b) => a.totals.sales - b.totals.sales)[0];
  const lq = lobQty(ls);
  const types = typeQty(ls);
  const lobFilter = p.q.lob && (APPLE_LOBS as readonly string[]).includes(p.q.lob) ? p.q.lob : null;
  const shownTypes = lobFilter ? types.filter((x) => x.lob === lobFilter) : types;

  // vs previous: same day range of the previous month (when registered)
  const pm = prevMonth(p.month);
  let prev: number | null = null;
  if (p.months.some((m) => m.month === pm)) {
    try {
      const ps = await getMonthSnapshot(pm);
      const fd = from.slice(8);
      const td = to.slice(8);
      prev = totals(ps.lines.filter((l) => l.date.slice(8) >= fd && l.date.slice(8) <= td)).sales;
    } catch {}
  }

  return (
    <div className="sd-content">
      <section className="sd-panel space-y-4 p-5">
        <div className="inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          <Link href={withQuery("/summary", p.q, { mode: null, from: null, to: null })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${!range ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Bulanan</Link>
          <Link href={withQuery("/summary", p.q, { mode: "range" })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${range ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Custom Range</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ParamSelect param="m" label="Periode" value={p.month} reset={["d", "from", "to"]} options={p.months.map((m) => ({ value: m.month, label: monthLabel(m.month) }))} />
          {range && (
            <>
              <ParamDate param="from" label="Dari" value={from} min={monthStart(p.month)} max={p.asOf} />
              <ParamDate param="to" label="Sampai" value={to} min={monthStart(p.month)} max={p.asOf} />
            </>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Box label="Total Sales" value={rpf(t.sales)} sub={`Target ${rpf(target)}`} />
        <Box label="Achievement" value={pct(ach ?? 0, 0)} />
        <Box label="Transaction" value={num(t.invoices)} />
        <Box label="UPT" value={dec(t.upt, 1).replace(",", ".")} />
        <Box label="ATV" value={rpf(t.atv)} />
        <Box label="Traffic" value={conv.daysWithTraffic ? num(conv.traffic) : <NeedData />} sub={conv.daysWithTraffic ? `${conv.daysWithTraffic} hari ada traffic` : "Tab Traffic / Settings"} />
        <Box label="CVR" value={conv.cvr == null ? <NeedData /> : pct(conv.cvr)} />
        <Box label="VS Previous" value={prev == null ? <NeedData /> : <Trend value={prev ? ((t.sales - prev) / prev) * 100 : null} digits={1} />} sub={prev == null ? `${monthLabel(pm)} belum terdaftar` : rpf(prev)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Box label="Best Day" value={best ? `${dateShort(best.date)} • ${rpf(best.totals.sales)}` : "—"} />
        <Box label="Lowest Day" value={low ? `${dateShort(low.date)} • ${rpf(low.totals.sales)}` : "—"} />
      </div>

      <Panel title="Sales Trend" desc="Maksimal satu point per tanggal." right={<span className="text-xs text-slate-500">{rows.length} hari</span>}>
        <LineChart data={rows.map((r) => ({ label: r.date.slice(8), value: r.totals.sales, tip: dateShort(r.date) }))} color="#2563eb" area />
      </Panel>

      <Panel title="Performance Breakdown">
        <div className="grid gap-3 md:grid-cols-3">
          <Box label="Device" value={rpf(deviceOf(t.byGroup))} flat />
          <Box label="Accessories" value={rpf(t.byGroup.ACC)} flat />
          <Box label="VAS" value={rpf(t.byGroup.VAS)} flat />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {APPLE_LOBS.map((k) => <span key={k} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold dark:border-slate-700">{LOB_LABEL[k]}: {num(lq[k])}</span>)}
        </div>
      </Panel>

      <Panel title="Target LOB Focus" desc="Actual dari Sales Person (qty per type). Pilih hanya type yang ingin ditampilkan." right={<NeedData label="Target: Need Data" />}>
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="sd-pill !py-1.5 text-sm">☰ Pilih Type ({types.length})</span>
          <Link href={withQuery("/summary", p.q, { lob: null })} className="sd-pill !py-1.5 text-sm" aria-current={!lobFilter ? "true" : undefined}>Semua</Link>
          {APPLE_LOBS.filter((k) => k !== "AirPods").map((k) => (
            <Link key={k} href={withQuery("/summary", p.q, { lob: k })} className="sd-pill !py-1.5 text-sm" aria-current={lobFilter === k ? "true" : undefined}>{LOB_LABEL[k]}</Link>
          ))}
        </div>
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead><tr><th>Device</th><th className="n">Actual</th><th className="n">Target</th><th className="n">Ach</th></tr></thead>
            <tbody>
              {shownTypes.map((x) => (
                <tr key={x.type}>
                  <td className="font-bold">{x.type}</td>
                  <td className="n font-bold">{num(x.qty)}</td>
                  <td className="n"><input className="sd-input !min-h-8 !w-32 text-right" disabled placeholder="0" aria-label={`Target ${x.type}`} /></td>
                  <td className="n">—</td>
                </tr>
              ))}
              {!shownTypes.length && <tr><td colSpan={4} className="text-center text-slate-500">Belum ada penjualan.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 rounded-2xl bg-blue-50 p-4 text-sm">
          <div><p className="text-xs text-slate-500">Total Target</p><b>—</b></div>
          <div><p className="text-xs text-slate-500">Actual</p><b>{num(shownTypes.reduce((a, x) => a + x.qty, 0))}</b></div>
          <div><p className="text-xs text-slate-500">Ach</p><b>—</b></div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Target per type belum ada sumbernya — perlu tab target type di Google Sheet atau input di aplikasi.</p>
      </Panel>

      <Panel title="Daily Performance" desc="Klik tanggal untuk membuka detail breakdown harian.">
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead>
              <tr>
                <th>Tanggal</th><th>Hari</th><th className="n">Total Sales</th><th className="n">Device</th><th className="n">ACC</th><th className="n">VAS</th><th className="n">Invoice</th><th className="n">Qty</th><th className="n">UPT</th><th className="n">ATV</th><th className="n">CVR</th>
                {/* per-LOB / provider columns are left out of the phone cards — tap the date for the full day */}
                <th className="n" data-fit-hide="1">MacBook</th><th className="n" data-fit-hide="1">iPad</th><th className="n" data-fit-hide="1">iPhone</th><th className="n" data-fit-hide="1">Apple Watch</th><th className="n" data-fit-hide="1">AirPods</th>
                {VAS_PROVIDERS.map((v) => <th key={v} className="n" data-fit-hide="1">{v}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td><Link className="font-semibold text-blue-600 hover:underline" href={withQuery("/sales", { m: p.month }, { d: r.date })}>{dateShort(r.date)}</Link></td>
                  <td>{dayName(r.date).slice(0, 3)}</td>
                  <td className="n font-black">{rpf(r.totals.sales)}</td>
                  <td className="n">{rpf(r.device)}</td>
                  <td className="n">{rpf(r.acc)}</td>
                  <td className="n">{rpf(r.vas)}</td>
                  <td className="n font-bold">{num(r.totals.invoices)}</td>
                  <td className="n">{num(r.totals.qty)}</td>
                  <td className="n font-bold">{dec(r.totals.upt, 1).replace(",", ".")}</td>
                  <td className="n">{rpf(r.totals.atv)}</td>
                  <td className="n">{r.cvr == null ? "—" : pct(r.cvr)}</td>
                  <td className="n">{num(r.lob.Mac)}</td>
                  <td className="n">{num(r.lob.iPad)}</td>
                  <td className="n">{num(r.lob.iPhone)}</td>
                  <td className="n">{num(r.lob["Apple Watch"])}</td>
                  <td className="n">{num(r.lob.AirPods)}</td>
                  {VAS_PROVIDERS.map((v) => <td key={v} className="n">{rpf(r.vasValue[v])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Box({ label, value, sub, flat }: { label: string; value: React.ReactNode; sub?: React.ReactNode; flat?: boolean }) {
  return (
    <div className={`${flat ? "rounded-2xl border border-slate-200 dark:border-slate-700" : "sd-panel"} p-4`}>
      <p className="text-[11px] font-black tracking-[.08em] text-slate-500 uppercase">{label}</p>
      <div className={`${numClass(value)} mt-1.5 font-black text-slate-950 sm:!text-xl`}>{value}</div>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
