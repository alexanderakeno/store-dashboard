import { Ach, Card, GroupName } from "@/components/ui";
import { PageStatus } from "@/components/layout/PageStatus";
import { Topbar } from "@/components/layout/Topbar";
import { weeklyView } from "@/lib/domain/views";
import { dayShort, dec, num, pct, rp, rpc } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { GROUPS } from "@/types/domain";

export default async function WeeklyPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Weekly" p={p} />;
  const weeks = weeklyView(p.snap, p.asOf);

  return (
    <>
      <Topbar title="Weekly" p={p} />
      <div className="stack">
        <Card title="Per minggu (Minggu–Sabtu)" aside="target minggu = target harian × jumlah hari">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Minggu</th><th className="n">Sales</th><th className="n">Target</th><th>Ach</th>
                  {GROUPS.map((g) => <th key={g} className="n"><GroupName group={g} /></th>)}
                  <th className="n">Inv</th><th className="n">Qty</th><th className="n">UPT</th><th className="n">ATV</th><th className="n">CVR</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.index} style={w.daysWithData === 0 ? { opacity: 0.5 } : undefined}>
                    <td>
                      <b>{w.label}</b>
                      <div className="small muted">{dayShort(w.start)} – {dayShort(w.end)}{w.daysWithData > 0 && w.daysWithData < w.days ? ` · ${w.daysWithData}/${w.days} hari` : ""}</div>
                    </td>
                    <td className="n" title={rp(w.totals.sales)}>{rpc(w.totals.sales)}</td>
                    <td className="n">{rpc(w.target)}</td>
                    <td>{w.daysWithData ? <Ach value={w.achievementPct} digits={0} /> : <span className="muted small">belum</span>}</td>
                    {GROUPS.map((g) => <td key={g} className="n">{rpc(w.totals.byGroup[g])}</td>)}
                    <td className="n">{num(w.totals.invoices)}</td>
                    <td className="n">{num(w.totals.qty)}</td>
                    <td className="n">{dec(w.totals.upt)}</td>
                    <td className="n">{rpc(w.totals.atv)}</td>
                    <td className="n">{pct(w.cvr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>Minggu yang sedang berjalan dibandingkan dengan target penuh minggu itu. Weekly Reason (input alasan) masuk fase 2.</div>
        </Card>
      </div>
    </>
  );
}
