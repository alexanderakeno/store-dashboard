import { Ach, Card, Delta } from "@/components/ui";
import { PageStatus } from "@/components/layout/PageStatus";
import { Topbar } from "@/components/layout/Topbar";
import { staffView } from "@/lib/domain/views";
import { displayName } from "@/lib/domain/normalize";
import { dec, num, pct, rp, rpc } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { GROUPS } from "@/types/domain";

export default async function StaffPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Staff" p={p} />;
  const v = staffView(p.snap, p.asOf);
  const all = [...v.staff, ...v.channels];

  return (
    <>
      <Topbar title="Staff" p={p} />
      <div className="stack">
        <Card title={`Ranking staff (${v.staff.length})`} aside="urut berdasarkan pencapaian MTD vs target bulanan">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th className="sticky-col">Nama</th><th className="n">Sales</th><th className="n">Target</th><th>Ach</th><th className="n">Est.</th><th className="n">Gap</th>
                  {GROUPS.map((g) => <th key={g} className="n">{g}</th>)}
                  <th className="n">Inv</th><th className="n">Qty</th><th className="n">UPT</th><th className="n">ATV</th>
                </tr>
              </thead>
              <tbody>
                {all.map((s, i) => {
                  const est = s.totals.sales * v.estimateFactor;
                  return (
                    <tr key={s.key}>
                      <td className="muted">{s.isChannel ? "" : i + 1}</td>
                      <td className="sticky-col" style={{ whiteSpace: "nowrap" }}>
                        <div>{displayName(s.name)}</div>
                        <div className="small muted">{s.isChannel ? "channel online (bukan staff)" : s.nik ?? "NIK tidak ada"}</div>
                      </td>
                      <td className="n" title={rp(s.totals.sales)}>{rpc(s.totals.sales)}</td>
                      <td className="n">{s.target ? rpc(s.target) : <span className="muted">–</span>}</td>
                      <td>{s.target ? <Ach value={s.achievement.achievementPct} digits={0} /> : <span className="muted small">–</span>}</td>
                      <td className="n">{s.target ? pct((est / s.target) * 100, 0) : "–"}</td>
                      <td className="n">{s.target ? <Delta value={s.achievement.gap} format={rpc} /> : "–"}</td>
                      {GROUPS.map((g) => (
                        <td key={g} className="n" title={s.targetByGroup[g] ? `Target ${rp(s.targetByGroup[g])} · ${pct((s.totals.byGroup[g] / s.targetByGroup[g]) * 100)}` : undefined}>
                          {rpc(s.totals.byGroup[g])}
                          {s.targetByGroup[g] > 0 && <div className="small muted">{pct((s.totals.byGroup[g] / s.targetByGroup[g]) * 100, 0)}</div>}
                        </td>
                      ))}
                      <td className="n">{num(s.totals.invoices)}</td>
                      <td className="n">{num(s.totals.qty)}</td>
                      <td className="n">{dec(s.totals.upt)}</td>
                      <td className="n">{rpc(s.totals.atv)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td></td><td className="sticky-col">Toko</td>
                  <td className="n">{rpc(v.store.sales)}</td>
                  <td className="n">{rpc(p.snap.target?.total ?? 0)}</td>
                  <td colSpan={3}></td>
                  {GROUPS.map((g) => <td key={g} className="n">{rpc(v.store.byGroup[g])}</td>)}
                  <td className="n">{num(v.store.invoices)}</td>
                  <td className="n">{num(v.store.qty)}</td>
                  <td className="n">{dec(v.store.upt)}</td>
                  <td className="n">{rpc(v.store.atv)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            Invoice yang dibagi beberapa staff dihitung 1× di toko dan 1× di tiap staff, sehingga Σ invoice staff bisa lebih besar dari invoice toko. Sales & qty selalu sama dengan total toko.
          </div>
        </Card>
      </div>
    </>
  );
}
