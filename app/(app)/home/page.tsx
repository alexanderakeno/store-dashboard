import Link from "next/link";
import { appConfig } from "@/config/app";
import { Ach, Card, Delta, GroupName, Meter, Tile } from "@/components/ui";
import { CopyButton } from "@/components/layout/Controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { Topbar } from "@/components/layout/Topbar";
import { DailyChart } from "@/components/modules/DailyChart";
import { shareText } from "@/lib/domain/share";
import { displayName } from "@/lib/domain/normalize";
import { homeView } from "@/lib/domain/views";
import { dateLong, dec, num, pct, rp, rpc } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Home" p={p} />;
  const h = homeView(p.snap, p.asOf);
  const timeGone = (h.daysElapsed / h.daysInMonth) * 100;
  const noTarget = !h.achievement.target;

  return (
    <>
      <Topbar title="Home" p={p} />
      <div className="stack">
        <div className="grid c3">
          <Card>
            <div className="hero">
              <span className="label">Sales MTD · s/d {dateLong(h.asOf)}</span>
              <span className="value" title={rp(h.totals.sales)}>{rpc(h.totals.sales)}</span>
              <div className="row small">
                <Ach value={h.achievement.achievementPct} />
                <span className="ink2">dari target {rpc(h.achievement.target)}</span>
                <span className="muted">· waktu berjalan {pct(timeGone, 0)}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <Meter value={h.achievement.achievementPct} tick={timeGone} label="Pencapaian MTD" />
              </div>
              <div className="grid k2 small" style={{ marginTop: 12 }}>
                <div>
                  <div className="muted">Gap</div>
                  <b><Delta value={h.achievement.gap} format={rpc} /></b>
                </div>
                <div>
                  <div className="muted">Estimasi closing {!h.estimateStable && <span className="badge warn">belum stabil</span>}</div>
                  <b>{rpc(h.estimate)}</b> <span className="ink2">({pct(h.estimatePct)})</span>
                </div>
                <div>
                  <div className="muted">Target harian</div>
                  <b>{rpc(h.dailyTarget)}</b>
                </div>
                <div>
                  <div className="muted">Butuh / hari sisa</div>
                  <b>{h.requiredPerDay == null ? "–" : rpc(h.requiredPerDay)}</b>
                </div>
              </div>
            </div>
          </Card>
          <Card title="Point" aside={<span>maks {h.points.max}</span>}>
            <div className="hero">
              <span className="value">{dec(h.points.total, 1)}</span>
              <span className="small ink2">Estimasi akhir bulan: <b>{dec(h.points.estimateTotal, 1)}</b></span>
            </div>
            <table style={{ marginTop: 10 }}>
              <tbody>
                {h.groups.map((g) => (
                  <tr key={g.group}>
                    <td><GroupName group={g.group} /></td>
                    <td className="n">{dec(g.point, 1)} <span className="muted">/ {g.pointCap}</span></td>
                    <td className="n muted">est {dec(g.estPoint, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {noTarget && <div className="alert warn small">Target bulan ini belum terbaca dari tab Target Store — pencapaian & point ditampilkan 0.</div>}

        <div className="grid k2 k4">
          <Tile label="Invoice" value={num(h.totals.invoices)} sub={`Hari ini ${num(h.day.totals.invoices)}`} />
          <Tile label="Qty" value={num(h.totals.qty)} sub={`UPT ${dec(h.totals.upt)}`} />
          <Tile label="ATV" value={rpc(h.totals.atv)} title={rp(h.totals.atv)} sub="Sales ÷ invoice" />
          <Tile
            label="CVR"
            value={pct(h.cvr.cvr)}
            sub={h.cvr.daysWithTraffic ? `Traffic ${num(h.cvr.traffic)} (${h.cvr.daysWithTraffic} hari)` : "Traffic belum diinput"}
          />
        </div>

        <Card title={`Hari ini · ${dateLong(h.day.date)}`} aside={<Link href={`/sales?m=${h.month}&d=${h.day.date}`} className="badge info">Detail invoice →</Link>}>
          <div className="grid k2 k4">
            <div><div className="small muted">Sales</div><b>{rpc(h.day.totals.sales)}</b> <Ach value={h.day.achievement.achievementPct} digits={0} /></div>
            <div><div className="small muted">Invoice</div><b>{num(h.day.totals.invoices)}</b></div>
            <div><div className="small muted">Qty · UPT</div><b>{num(h.day.totals.qty)}</b> · {dec(h.day.totals.upt)}</div>
            <div><div className="small muted">AR Qoala MTD</div><b>{pct(h.ar.ar)}</b> <span className="small muted">({h.ar.vasQty}/{h.ar.deviceQty})</span></div>
          </div>
        </Card>

        <Card title="Pencapaian per grup" aside="MTD vs target bulanan">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Grup</th><th className="n">Actual</th><th className="n">Target</th><th>Ach</th><th className="n">Gap</th><th className="n">Estimasi</th><th className="n">Qty</th>
                </tr>
              </thead>
              <tbody>
                {h.groups.map((g) => (
                  <tr key={g.group}>
                    <td><GroupName group={g.group} /></td>
                    <td className="n" title={rp(g.actual)}>{rpc(g.actual)}</td>
                    <td className="n" title={rp(g.target)}>{rpc(g.target)}</td>
                    <td style={{ minWidth: 120 }}>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <div style={{ flex: 1 }}><Meter value={g.achievementPct} tick={timeGone} label={`Pencapaian ${g.group}`} /></div>
                        <Ach value={g.achievementPct} digits={0} />
                      </div>
                    </td>
                    <td className="n"><Delta value={g.gap} format={rpc} /></td>
                    <td className="n">{rpc(g.estimate)} <span className="muted small">{pct(g.estimatePct, 0)}</span></td>
                    <td className="n">{num(g.qty)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="n">{rpc(h.totals.sales)}</td>
                  <td className="n">{rpc(h.achievement.target)}</td>
                  <td><Ach value={h.achievement.achievementPct} digits={0} /></td>
                  <td className="n"><Delta value={h.achievement.gap} format={rpc} /></td>
                  <td className="n">{rpc(h.estimate)}</td>
                  <td className="n">{num(h.totals.qty)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>Garis tipis di bar = persentase hari yang sudah berjalan. AirPods dihitung di ACC.</div>
        </Card>

        <div className="grid c3">
          <Card title="Sales harian" aside="klik batang untuk detail hari">
            <DailyChart data={h.series} month={h.month} selected={h.asOf} />
          </Card>
          <Card title="Top staff" aside={<Link href={`/staff?m=${h.month}`} className="badge info">Semua →</Link>}>
            <table>
              <tbody>
                {h.topStaff.map((s, i) => (
                  <tr key={s.key}>
                    <td className="muted" style={{ width: 20 }}>{i + 1}</td>
                    <td>{displayName(s.name)}</td>
                    <td className="n">{rpc(s.totals.sales)}</td>
                    <td className="n"><Ach value={s.achievement.achievementPct} digits={0} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <Card title="Share daily" aside={<CopyButton text={shareText(h, appConfig().storeName)} label="Salin teks WhatsApp" />}>
          <pre className="small ink2" style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>{shareText(h, appConfig().storeName)}</pre>
        </Card>
      </div>
    </>
  );
}
