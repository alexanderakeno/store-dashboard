import Link from "next/link";
import { PageIntro, Panel, Progress, achColor } from "@/components/kit";
import { ParamDate, ParamSelect } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { APPLE_LOBS, VAS_PROVIDERS, clampRange, linesByStaff, linesIn, lobQty, staffStats, timeGonePct, vasSplit } from "@/lib/domain/extra";
import { totals } from "@/lib/domain/kpi";
import { nameKey } from "@/lib/domain/normalize";
import { daysInMonth, eachDay, monthStart } from "@/lib/domain/period";
import { dec, monthLabel, num, pct, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";
import { GROUPS } from "@/types/domain";

export default async function StaffPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Staff Performance" p={p} />;
  const s = p.snap;
  const range = p.q.range === "1";
  const { from, to } = range ? clampRange(p.month, p.asOf, p.q.from, p.q.to) : { from: monthStart(p.month), to: p.asOf };
  const dim = daysInMonth(p.month);
  const scale = range ? eachDay(from, to).length / dim : 1;
  const tg = range ? 100 : timeGonePct(p.month, p.asOf);
  const ls = linesIn(s, from, to);
  const all = staffStats(ls, s.target, tg, { targetScale: scale });
  const pick = p.q.staff && all.some((x) => x.key === p.q.staff) ? p.q.staff : "";
  const rows = pick ? all.filter((x) => x.key === pick) : all;
  const team = totals(ls);
  const teamTarget = (s.target?.total ?? 0) * scale;
  const teamAch = teamTarget ? (team.sales / teamTarget) * 100 : null;
  const onTrack = (teamAch ?? 0) >= tg;
const teamGapTg = team.sales - (teamTarget * tg) / 100;
  const byKey = linesByStaff(ls);
  const lobTotal = lobQty(ls);

  // VAS per salesperson × provider; staff target per provider comes from the VAS section of Target Store
  const vasCols = s.target?.sections.VAS?.columns ?? [];
  const vasTarget = (name: string, provider: string) => {
    const st = s.target?.staff.find((x) => nameKey(x.name) === nameKey(name));
    const col = vasCols.find((c) => nameKey(c) === nameKey(provider));
    return st && col ? (st.byColumn[`VAS:${col}`] ?? 0) * scale : 0;
  };
  const vasRows = rows.map((r) => {
    const split = vasSplit(byKey.get(r.key) ?? []);
    const cells = VAS_PROVIDERS.map((pv) => ({ pv, ...split[pv], target: vasTarget(r.name, pv) }));
    const value = cells.reduce((a, c) => a + c.value, 0);
    const qty = cells.reduce((a, c) => a + c.qty, 0);
    const target = cells.reduce((a, c) => a + c.target, 0);
    return { r, cells, value, qty, target };
  });
  const vasSum = VAS_PROVIDERS.map((pv) => ({
    pv,
    value: vasRows.reduce((a, x) => a + x.cells.find((c) => c.pv === pv)!.value, 0),
    qty: vasRows.reduce((a, x) => a + x.cells.find((c) => c.pv === pv)!.qty, 0),
    target: vasRows.reduce((a, x) => a + x.cells.find((c) => c.pv === pv)!.target, 0),
  }));
  const vasAll = { value: vasSum.reduce((a, c) => a + c.value, 0), qty: vasSum.reduce((a, c) => a + c.qty, 0), target: vasSum.reduce((a, c) => a + c.target, 0) };
  const achTone = (v: number, t: number) => ((v / t) * 100 >= tg ? "text-emerald-600" : "text-rose-600");

  return (
    <div className="sd-content">
      <PageIntro title="Staff Performance" desc="Seluruh staff toko kecuali akun online (channel)." />
      <section className="sd-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="font-black text-slate-950">Filter Range Penjualan Daily</p>
          <p className="text-sm text-slate-500">Aktifkan hanya saat ingin menarik pencapaian berdasarkan range tanggal.</p>
        </div>
        <Link href={withQuery("/staff", p.q, { range: range ? null : "1", from: null, to: null })} className={`sd-btn ${range ? "" : "primary"}`}>{range ? "Tutup Range" : "Buka Range"}</Link>
        {range && (
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <ParamDate param="from" label="Dari" value={from} min={monthStart(p.month)} max={p.asOf} />
            <ParamDate param="to" label="Sampai" value={to} min={monthStart(p.month)} max={p.asOf} />
          </div>
        )}
      </section>
      <section className="sd-panel grid gap-3 p-5 sm:grid-cols-2">
        <ParamSelect param="m" label="Bulan" value={p.month} reset={["d", "from", "to", "staff"]} options={p.months.map((m) => ({ value: m.month, label: monthLabel(m.month) }))} />
        <ParamSelect param="staff" label="Staff" value={pick} options={[{ value: "", label: "Semua Staff" }, ...all.map((x) => ({ value: x.key, label: x.name }))]} />
      </section>

      <section className="sd-panel p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <b className="text-slate-950">Team Sales {rpf(team.sales)} / Target {rpf(teamTarget)}</b>
          <span>Achievement {pct(teamAch ?? 0)}</span>
          <span>{range ? "Range" : "Monthly Pace"} {pct(tg)}</span>
          <span className={`sd-badge ${onTrack ? "green" : "red"}`}>● {onTrack ? "On Track" : "Behind"}</span>
          <span>Gap {rpf(team.sales - teamTarget)}</span>
<span className={`font-semibold ${teamGapTg >= 0 ? "text-emerald-600" : "text-rose-600"}`}>Gap TG {teamGapTg >= 0 ? "+" : ""}{rpf(teamGapTg)}</span>
        </div>
        <div className="mt-3"><Progress value={teamAch} tick={tg} color={achColor(teamAch, tg)} label="Achievement tim" /></div>
      </section>

      <Panel title="Staff Performance" desc={range ? `Achievement value ${from} s/d ${to} (target dipro-rata ${eachDay(from, to).length} hari).` : "Achievement value bulanan."}>
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead><tr><th>Nama</th><th className="n">Target</th><th className="n">Achievement</th><th className="n">%</th><th>Pace</th><th className="n">Gap</th><th className="n">Accessories</th><th className="n">VAS</th><th className="n">UPT</th><th className="n">ATV</th><th className="n">Trx</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td><p className="font-bold text-slate-950">{r.name}</p><p className="text-xs text-slate-400">{r.nik ?? "NIK tidak ada"}</p></td>
                  <td className="n">{rpf(r.target)}</td>
                  <td className="n font-black">{rpf(r.totals.sales)}</td>
                  <td className="n">{pct(r.achievementPct ?? 0, 0)}</td>
                  <td><span className={`sd-badge ${r.target && r.onPace ? "green" : r.target ? "red" : "slate"}`}>● {r.target ? (r.onPace ? "On Track" : "Behind") : "No Target"}</span></td>
                  <td className={`n ${r.gap > 0 ? "text-rose-600" : "text-emerald-600"}`}>{rpf(r.gap)}</td>
                  <td className="n">{rpf(r.acc)}</td>
                  <td className="n">{rpf(r.vas)}</td>
                  <td className="n">{dec(r.totals.upt, 1).replace(",", ".")}</td>
                  <td className="n">{rpf(r.totals.atv)}</td>
                  <td className="n">{num(r.totals.invoices)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Pace: On Track bila achievement ≥ time gone ({pct(tg)}). Gap = target − achievement. Jabatan staff (Cashier / Sales Assistant) butuh master staff — <b>Need Data</b>.</p>
      </Panel>

      <Panel title="Achievement per Grup" desc="Actual vs target staff per grup (Apple · Android · ACC · VAS).">
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead><tr><th>Nama</th>{GROUPS.map((g) => <th key={g} className="n">{g}</th>)}<th className="n">Total</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const st = s.target?.staff.find((x) => nameKey(x.name) === nameKey(r.name));
                return (
                  <tr key={r.key}>
                    <td className="font-bold">{r.name}</td>
                    {GROUPS.map((g) => {
                      const tgt = (st?.byGroup[g] ?? 0) * scale;
                      return <td key={g} className="n">{rpf(r.totals.byGroup[g])}{tgt > 0 && <div className={`text-xs font-semibold ${(r.totals.byGroup[g] / tgt) * 100 >= tg ? "text-emerald-600" : "text-rose-600"}`}>{pct((r.totals.byGroup[g] / tgt) * 100, 0)} dari {rpf(tgt)}</div>}</td>;
                    })}
                    <td className="n font-black">{rpf(r.totals.sales)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Pencapaian VAS" desc={`Value & qty VAS per salesperson per provider${range ? ` (${from} s/d ${to}, target dipro-rata)` : ""}. Persen = achievement vs target staff per provider dari Target Store.`}>
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead>
              <tr>
                <th>Nama</th>
                {VAS_PROVIDERS.map((pv) => <th key={pv} className="n">{pv}</th>)}
                <th className="n">Total VAS</th>
              </tr>
            </thead>
            <tbody>
              {vasRows.map(({ r, cells, value, qty, target }) => (
                <tr key={r.key}>
                  <td className="font-bold">{r.name}</td>
                  {cells.map((c) => (
                    <td key={c.pv} className="n">
                      {c.value || c.qty ? rpf(c.value) : <span className="text-slate-300">–</span>}
                      {(c.value !== 0 || c.qty !== 0) && <div className="text-xs text-slate-400">{num(c.qty)} unit</div>}
                      {c.target > 0 && <div className={`text-xs font-semibold ${achTone(c.value, c.target)}`}>{pct((c.value / c.target) * 100, 0)} dari {rpf(c.target)}</div>}
                    </td>
                  ))}
                  <td className="n font-black">
                    {rpf(value)}
                    <div className="text-xs font-normal text-slate-400">{num(qty)} unit</div>
                    {target > 0 && <div className={`text-xs font-semibold ${achTone(value, target)}`}>{pct((value / target) * 100, 0)} dari {rpf(target)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL</td>
                {vasSum.map((c) => (
                  <td key={c.pv} className="n">
                    {rpf(c.value)}
                    <div className="text-xs font-normal">{num(c.qty)} unit</div>
                    {c.target > 0 && <div className={`text-xs font-semibold ${achTone(c.value, c.target)}`}>{pct((c.value / c.target) * 100, 0)}</div>}
                  </td>
                ))}
                <td className="n">
                  {rpf(vasAll.value)}
                  <div className="text-xs font-normal">{num(vasAll.qty)} unit</div>
                  {vasAll.target > 0 && <div className={`text-xs font-semibold ${achTone(vasAll.value, vasAll.target)}`}>{pct((vasAll.value / vasAll.target) * 100, 0)} dari {rpf(vasAll.target)}</div>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Hijau bila achievement ≥ {range ? "100%" : `time gone (${pct(tg)})`}. {vasCols.length ? "" : "Target VAS per provider belum terbaca dari tab Target Store — hanya actual yang ditampilkan."}</p>
      </Panel>

      <Panel title="Achievement by LOB" desc="Qty per staff.">
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead><tr><th>Nama</th><th className="n">iPhone</th><th className="n">MacBook</th><th className="n">iPad</th><th className="n">Apple Watch</th><th className="n">AirPods</th><th className="n">Total Device</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const q = lobQty(byKey.get(r.key) ?? []);
                return (
                  <tr key={r.key}>
                    <td className="font-bold">{r.name}</td>
                    {APPLE_LOBS.map((k) => <td key={k} className="n">{num(q[k])}</td>)}
                    <td className="n font-black">{num(q.iPhone + q.Mac + q.iPad + q["Apple Watch"] + q.AirPods)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td>TOTAL</td>{APPLE_LOBS.map((k) => <td key={k} className="n">{num(lobTotal[k])}</td>)}<td className="n">{num(APPLE_LOBS.reduce((a, k) => a + lobTotal[k], 0))}</td></tr></tfoot>
          </table>
        </div>
      </Panel>
    </div>
  );
}
