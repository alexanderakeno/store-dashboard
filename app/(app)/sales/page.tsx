import Link from "next/link";
import { Ach, Card, GroupName } from "@/components/ui";
import { PageStatus } from "@/components/layout/PageStatus";
import { Topbar } from "@/components/layout/Topbar";
import { breakdown } from "@/lib/domain/kpi";
import { displayName } from "@/lib/domain/normalize";
import { dailyRows, dayDetail } from "@/lib/domain/views";
import { dateLong, dayShort, dec, num, pct, rp, rpc } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { GROUPS } from "@/types/domain";

export default async function SalesPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Daily Sales" p={p} />;
  const rows = dailyRows(p.snap, p.asOf);
  const day = dayDetail(p.snap, p.asOf);
  const dayLines = p.snap.lines.filter((l) => l.date === p.asOf);
  const byGroup = breakdown(dayLines, (l) => l.group);
  const total = rows.reduce(
    (a, r) => ({ sales: a.sales + r.totals.sales, target: a.target + r.target, inv: a.inv + r.totals.invoices, qty: a.qty + r.totals.qty, traffic: a.traffic + (r.traffic ?? 0) }),
    { sales: 0, target: 0, inv: 0, qty: 0, traffic: 0 },
  );
  const uncertain = dayLines.filter((l) => l.qtySource === "uncertain").length;

  return (
    <>
      <Topbar title="Daily Sales" p={p} />
      <div className="grid c2" style={{ alignItems: "start" }}>
        <Card title="Per hari" aside="klik baris untuk detail">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th><th className="n">Sales</th><th>Ach</th><th className="n">Inv</th><th className="n">Qty</th><th className="n">UPT</th><th className="n">ATV</th><th className="n">CVR</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.date} className={r.date === p.asOf ? "sel" : ""}>
                    <td><Link href={`/sales?m=${p.month}&d=${r.date}`} style={{ textDecoration: "underline", textDecorationColor: "var(--grid)" }}>{dayShort(r.date)}</Link></td>
                    <td className="n" title={rp(r.totals.sales)}>{rpc(r.totals.sales)}</td>
                    <td><Ach value={r.achievementPct} digits={0} /></td>
                    <td className="n">{num(r.totals.invoices)}</td>
                    <td className="n">{num(r.totals.qty)}</td>
                    <td className="n">{dec(r.totals.upt)}</td>
                    <td className="n">{rpc(r.totals.atv)}</td>
                    <td className="n">{pct(r.cvr)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>MTD</td>
                  <td className="n">{rpc(total.sales)}</td>
                  <td><Ach value={total.target ? (total.sales / total.target) * 100 : null} digits={0} /></td>
                  <td className="n" title="Jumlah invoice unik per hari (invoice lintas hari dihitung per hari)">{num(total.inv)}</td>
                  <td className="n">{num(total.qty)}</td>
                  <td className="n">{dec(total.inv ? total.qty / total.inv : null)}</td>
                  <td className="n">{rpc(total.inv ? total.sales / total.inv : null)}</td>
                  <td className="n"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <div className="stack">
          <Card title={dateLong(day.date)}>
            <div className="grid k2">
              <div><div className="small muted">Sales</div><b>{rp(day.totals.sales)}</b></div>
              <div><div className="small muted">Invoice · Qty · UPT</div><b>{num(day.totals.invoices)} · {num(day.totals.qty)} · {dec(day.totals.upt)}</b></div>
            </div>
            <table style={{ marginTop: 10 }}>
              <tbody>
                {GROUPS.map((g) => {
                  const r = byGroup.find((b) => b.key === g);
                  return (
                    <tr key={g}>
                      <td><GroupName group={g} /></td>
                      <td className="n">{rpc(r?.sales ?? 0)}</td>
                      <td className="n muted">{num(r?.qty ?? 0)} pcs</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {uncertain > 0 && <div className="small muted" style={{ marginTop: 8 }}>{uncertain} baris qty tidak pasti (harga tidak cocok harga satuan) — dihitung 1 unit.</div>}
          </Card>

          <Card title={`Invoice (${day.invoices.length})`} aside="ketuk untuk melihat item">
            {day.invoices.length === 0 && <div className="muted small">Tidak ada transaksi.</div>}
            {day.invoices.map((inv) => (
              <details key={inv.invoice} className="inv">
                <summary>
                  <span>#{inv.invoice} <span className="muted small">· {[...new Set(inv.items.map((i) => displayName(i.staffName)))].join(", ")}</span></span>
                  <span className="num">{rp(inv.value)}</span>
                  <span className="small muted">{inv.lines} baris · qty {num(inv.qty)}</span>
                </summary>
                <div className="items">
                  <table>
                    <tbody>
                      {inv.items.map((it, k) => (
                        <tr key={k}>
                          <td>
                            <div>{it.description || it.article}</div>
                            <div className="small muted">{it.article} · {it.group}{it.lob ? ` · ${it.lob}` : ""}{it.supplier ? ` · ${it.supplier}` : ""}{it.vasProvider ? ` · ${it.vasProvider}` : ""}</div>
                          </td>
                          <td className="n">{it.countsInQty ? `${it.qty}×` : <span className="muted">–</span>}{it.qtySource === "uncertain" && <span title="qty tidak pasti"> ?</span>}</td>
                          <td className="n">{rpc(it.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
