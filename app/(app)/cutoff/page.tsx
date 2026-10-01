import { Alert, Card } from "@/components/ui";
import { PageStatus } from "@/components/layout/PageStatus";
import { Topbar } from "@/components/layout/Topbar";
import { dayShort, num, rp, timeAgo } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";

export default async function CutoffPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Cut Off & Rekonsiliasi" p={p} />;
  const s = p.snap;
  const errors = s.issues.filter((i) => i.severity === "error");
  const spByDay = new Map<string, number>();
  for (const l of s.lines) spByDay.set(l.date, (spByDay.get(l.date) ?? 0) + l.amount);
  const mrByDay = new Map<string, number>();
  for (const m of s.merch) mrByDay.set(m.date, (mrByDay.get(m.date) ?? 0) + m.net);
  const days = [...new Set([...spByDay.keys(), ...mrByDay.keys()])].sort().reverse();

  return (
    <>
      <Topbar title="Cut Off & Rekonsiliasi" p={p} />
      <div className="stack">
        <Card title="Sumber data">
          <table>
            <tbody>
              <tr><td className="muted">File</td><td>{s.sourceTitle}</td></tr>
              <tr><td className="muted">Data s/d</td><td>{s.lastDataDate ?? "–"}</td></tr>
              <tr><td className="muted">Dibaca</td><td>{new Date(s.loadedAt).toLocaleString("id-ID")} ({timeAgo(s.loadedAt)})</td></tr>
              <tr><td className="muted">Baris</td><td>{num(s.lines.length)} Sales Person · {num(s.merch.length)} Merchandise Report{s.skippedOtherMonth ? ` · ${num(s.skippedOtherMonth)} baris bulan lain dilewati` : ""}</td></tr>
              <tr><td className="muted">Target</td><td>{s.target ? rp(s.target.total) : "tidak terbaca"}</td></tr>
            </tbody>
          </table>
        </Card>

        <Card title="Pemeriksaan otomatis">
          <div className="stack">
            {errors.length === 0 && <Alert kind="ok">✓ Semua pemeriksaan utama cocok: MR = SP, Σ grup = total, Σ staff = toko, invoice konsisten.</Alert>}
            {s.issues.map((i, k) => (
              <Alert key={k} kind={i.severity === "error" ? "error" : i.severity === "warning" ? "warn" : "info"}>
                <b>{i.severity === "error" ? "✕" : i.severity === "warning" ? "!" : "i"} {i.check}</b> — {i.detail}
                {i.expected != null && <div className="small">diharapkan {rp(i.expected)} · aktual {rp(i.actual)}</div>}
              </Alert>
            ))}
            {s.warnings.map((w, k) => <Alert key={`w${k}`} kind="warn">{w}</Alert>)}
          </div>
        </Card>

        <Card title="Kontrol harian MR vs SP">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tanggal</th><th className="n">Merchandise Report</th><th className="n">Sales Person</th><th className="n">Selisih</th></tr></thead>
              <tbody>
                {days.map((d) => {
                  const mr = mrByDay.get(d) ?? 0;
                  const sp = spByDay.get(d) ?? 0;
                  const diff = sp - mr;
                  return (
                    <tr key={d}>
                      <td>{dayShort(d)}</td>
                      <td className="n">{rp(mr)}</td>
                      <td className="n">{rp(sp)}</td>
                      <td className={`n ${Math.abs(diff) > 1 ? "neg" : "muted"}`}>{Math.abs(diff) > 1 ? `✕ ${rp(diff)}` : "✓ 0"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
