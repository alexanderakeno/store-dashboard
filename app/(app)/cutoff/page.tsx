import { appConfig } from "@/config/app";
import { PageIntro, Panel } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { dayShort, num, rpf, timeAgo } from "@/lib/format";
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
  const tone = { error: "error", warning: "warn", info: "" } as const;

  return (
    <div className="sd-content">
      <PageIntro title="Cut Off & Rekonsiliasi" desc="Pemeriksaan otomatis setiap kali data dibaca." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Sumber data">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-slate-500">File</dt><dd className="font-semibold">{s.sourceTitle}</dd>
            <dt className="text-slate-500">Data s/d</dt><dd>{s.lastDataDate ?? "–"}</dd>
            <dt className="text-slate-500">Dibaca</dt><dd>{new Date(s.loadedAt).toLocaleString("id-ID", { timeZone: appConfig().timeZone })} ({timeAgo(s.loadedAt)})</dd>
            <dt className="text-slate-500">Baris</dt><dd>{num(s.lines.length)} Sales Person · {num(s.merch.length)} Merchandise Report{s.skippedOtherMonth ? ` · ${num(s.skippedOtherMonth)} baris bulan lain dilewati` : ""}</dd>
            <dt className="text-slate-500">Target</dt><dd>{s.target ? rpf(s.target.total) : "tidak terbaca"}</dd>
          </dl>
        </Panel>
        <Panel title="Pemeriksaan otomatis">
          <div className="stack">
            {errors.length === 0 && <div className="alert ok">✓ Semua pemeriksaan utama cocok: MR = SP, Σ grup = total, Σ staff = toko, invoice konsisten.</div>}
            {s.issues.map((i, k) => (
              <div key={k} className={`alert ${tone[i.severity]}`}>
                <b>{i.severity === "error" ? "✕" : i.severity === "warning" ? "!" : "i"} {i.check}</b> — {i.detail}
                {i.expected != null && <div className="small">diharapkan {rpf(i.expected)} · aktual {rpf(i.actual)}</div>}
              </div>
            ))}
            {s.warnings.map((w, k) => <div key={`w${k}`} className="alert warn">{w}</div>)}
          </div>
        </Panel>
      </div>
      <Panel title="Kontrol harian MR vs SP">
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead><tr><th>Tanggal</th><th className="n">Merchandise Report</th><th className="n">Sales Person</th><th className="n">Selisih</th></tr></thead>
            <tbody>
              {days.map((d) => {
                const mr = mrByDay.get(d) ?? 0;
                const sp = spByDay.get(d) ?? 0;
                const diff = sp - mr;
                return (
                  <tr key={d}>
                    <td>{dayShort(d)}</td>
                    <td className="n">{rpf(mr)}</td>
                    <td className="n">{rpf(sp)}</td>
                    <td className={`n font-bold ${Math.abs(diff) > 1 ? "text-rose-600" : "text-emerald-600"}`}>{Math.abs(diff) > 1 ? `✕ ${rpf(diff)}` : "✓ 0"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
