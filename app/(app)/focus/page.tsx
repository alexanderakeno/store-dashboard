import { Ach, Card, Delta, GroupName, Meter } from "@/components/ui";
import { PageStatus } from "@/components/layout/PageStatus";
import { Topbar } from "@/components/layout/Topbar";
import { daysInMonth } from "@/lib/domain/period";
import { focusView } from "@/lib/domain/views";
import { num, rp, rpc } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";

export default async function FocusPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Product Focus" p={p} />;
  const sections = focusView(p.snap, p.asOf);
  const timeGone = (Number(p.asOf.slice(8)) / daysInMonth(p.month)) * 100;

  return (
    <>
      <Topbar title="Product Focus" p={p} />
      <div className="grid c2" style={{ alignItems: "start" }}>
        {sections.map((s) => (
          <Card key={s.group} title={<h2 className="row"><GroupName group={s.group} /> <span className="ink2" style={{ fontWeight: 400 }}>· {s.title}</span></h2>} aside={`${rpc(s.actual)} / ${rpc(s.target)}`}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>{s.group === "ACC" ? "Supplier" : s.group === "VAS" ? "Provider" : s.group === "Apple" ? "LOB" : "Brand"}</th><th className="n">Actual</th><th className="n">Qty</th><th className="n">Target</th><th>Ach</th><th className="n">Gap</th></tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        {r.key}
                        {s.group === "Apple" && r.key === "AirPods" && <div className="small muted">dihitung di ACC</div>}
                        {!r.inTarget && r.target === 0 && r.actual > 0 && <div className="small muted">tanpa target</div>}
                      </td>
                      <td className="n" title={rp(r.actual)}>{rpc(r.actual)}</td>
                      <td className="n">{num(r.qty)}</td>
                      <td className="n">{r.target ? rpc(r.target) : <span className="muted">–</span>}</td>
                      <td style={{ minWidth: 110 }}>
                        {r.target ? (
                          <div className="row" style={{ flexWrap: "nowrap" }}>
                            <div style={{ flex: 1 }}><Meter value={r.achievementPct} tick={timeGone} label={`Pencapaian ${r.key}`} /></div>
                            <Ach value={r.achievementPct} digits={0} />
                          </div>
                        ) : <span className="muted small">–</span>}
                      </td>
                      <td className="n">{r.target ? <Delta value={r.gap} format={rpc} /> : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {s.rows.length === 0 && <div className="small muted">Belum ada penjualan atau target.</div>}
          </Card>
        ))}
      </div>
      <div className="small muted" style={{ marginTop: 12 }}>
        Target per LOB/brand/supplier/provider dibaca dari tab Target Store (baris Target (IDR)). Mapping brand → supplier bisa diubah di Settings.
      </div>
    </>
  );
}
