import { EmptyBlock, PageIntro, Panel, Stat } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { totals } from "@/lib/domain/kpi";
import { dateShort, dayName, monthLabel, num, pct } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import type { Tracker } from "@/types/extras";

export default async function CxPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="NPS/CX & GR" p={p} />;
  const clip = (t: Tracker | null): Tracker | null => (t ? { ...t, days: t.days.filter((d) => d.date <= p.asOf) } : null);
  const cx = clip(p.snap.extras.cx);
  const gr = clip(p.snap.extras.gr);
  if (!cx && !gr)
    return (
      <div className="sd-content">
        <PageIntro title="NPS / CX & Google Review" desc="Rekap pencapaian CX & Google Review per staff per hari." />
        <EmptyBlock title="Tab CX&GR Tracker tidak ditemukan">Tambahkan tab &quot;CX&amp;GR Tracker&quot; di file bulanan {monthLabel(p.month)} (blok CX dan GR dengan header Date | Day | nama staff | Total | Total Invoice).</EmptyBlock>
      </div>
    );
  const staff = [...new Set([...(cx?.staff ?? []), ...(gr?.staff ?? [])])];
  const sumBy = (t: Tracker | null, name: string) => (t ? t.days.reduce((a, d) => a + (d.byStaff[name] ?? 0), 0) : 0);
  const total = (t: Tracker | null) => (t ? t.days.reduce((a, d) => a + d.total, 0) : 0);
  const dates = [...new Set([...(cx?.days ?? []), ...(gr?.days ?? [])].map((d) => d.date))].sort();
  const invOf = (date: string) => cx?.days.find((d) => d.date === date)?.invoices ?? gr?.days.find((d) => d.date === date)?.invoices ?? totals(p.snap.lines.filter((l) => l.date === date)).invoices;
  const totalInv = dates.reduce((a, d) => a + (invOf(d) ?? 0), 0);
  const day = p.asOf;
  const forgot = staff.filter((n) => !(cx?.days.find((d) => d.date === day)?.byStaff[n]) && !(gr?.days.find((d) => d.date === day)?.byStaff[n]));
  const tCx = total(cx);
  const tGr = total(gr);
  return (
    <div className="sd-content">
      <PageIntro title="NPS / CX & Google Review" desc={`Sumber: tab CX&GR Tracker · ${monthLabel(p.month)}. Input dilakukan di Google Sheet.`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total CX" value={num(tCx)} tone="blue" sub={`AR ${pct(totalInv ? (tCx / totalInv) * 100 : null)}`} />
        <Stat label="Total Google Review" value={num(tGr)} tone="green" sub={`AR ${pct(totalInv ? (tGr / totalInv) * 100 : null)}`} />
        <Stat label="Total Invoice" value={num(totalInv)} tone="violet" />
        <Stat label="Hari terisi" value={num(dates.filter((d) => (cx?.days.find((x) => x.date === d)?.total ?? 0) + (gr?.days.find((x) => x.date === d)?.total ?? 0) > 0).length)} tone="amber" sub={`dari ${dates.length} hari`} />
      </div>
      <Panel title="Reminder Staff" desc={`Staff tanpa CX / GR pada ${dateShort(day)}.`}>
        <div className="flex flex-wrap gap-2">
          {forgot.map((n) => <span key={n} className="sd-badge amber">{n}</span>)}
          {!forgot.length && <span className="text-sm text-slate-500">Semua staff sudah ada CX / GR.</span>}
        </div>
      </Panel>
      <Panel title="Pencapaian per Staff">
        <div className="sd-table-wrap"><table className="sd-table">
          <thead><tr><th>Staff</th><th className="n">CX</th><th className="n">Share CX</th><th className="n">Google Review</th><th className="n">Share GR</th></tr></thead>
          <tbody>{staff.map((n) => <tr key={n}><td className="font-bold">{n}</td><td className="n">{num(sumBy(cx, n))}</td><td className="n">{pct(tCx ? (sumBy(cx, n) / tCx) * 100 : null, 0)}</td><td className="n">{num(sumBy(gr, n))}</td><td className="n">{pct(tGr ? (sumBy(gr, n) / tGr) * 100 : null, 0)}</td></tr>)}</tbody>
          <tfoot><tr><td>TOTAL</td><td className="n">{num(tCx)}</td><td /><td className="n">{num(tGr)}</td><td /></tr></tfoot>
        </table></div>
      </Panel>
      <Panel title="Rekap Harian" desc="Pencapaian seluruh staff per hari.">
        <div className="sd-table-wrap"><table className="sd-table">
          <thead><tr><th>Tanggal</th><th>Hari</th><th className="n">CX</th><th className="n">Google Review</th><th className="n">Invoice</th><th className="n">AR CX</th><th className="n">AR GR</th></tr></thead>
          <tbody>
            {[...dates].reverse().map((d) => {
              const c = cx?.days.find((x) => x.date === d)?.total ?? 0;
              const g = gr?.days.find((x) => x.date === d)?.total ?? 0;
              const inv = invOf(d) ?? 0;
              return <tr key={d}><td className="whitespace-nowrap">{dateShort(d).replace(/ \d{4}$/, "")}</td><td>{dayName(d)}</td><td className="n">{num(c)}</td><td className="n">{num(g)}</td><td className="n">{num(inv)}</td><td className="n">{inv ? pct((c / inv) * 100, 0) : "—"}</td><td className="n">{inv ? pct((g / inv) * 100, 0) : "—"}</td></tr>;
            })}
          </tbody>
        </table></div>
      </Panel>
    </div>
  );
}
