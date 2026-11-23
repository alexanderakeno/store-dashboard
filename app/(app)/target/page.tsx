import { PageIntro, Panel } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { daysInMonth } from "@/lib/domain/period";
import { monthLabel, pct, rpc, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";

/**
 * Target: the monthly target table exactly as written in the month's Google Sheet, tab "Dashboard"
 * (B6:G17) — target per staff per group (Apple · Android · Accesories · VAS · Total) and the sheet's
 * own Total row.
 */
export default async function TargetPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Target" p={p} />;
  const s = p.snap;
  const t = s.extras.dashTarget;
  const dim = daysInMonth(p.month);
  const intro = (
    <PageIntro title="Target" desc={`Target bulanan per staff · ${monthLabel(p.month)} · dari sheet "${s.sourceTitle}", tab Dashboard (B6:G17).`} />
  );
  if (!t) {
    return (
      <div className="sd-content">
        {intro}
        <div className="alert warn">
          {t === undefined
            ? "Data sheet belum dibaca ulang sejak menu ini dipasang — klik Perbarui di kanan atas untuk memuat tabel target."
            : 'Tabel target tidak ditemukan di tab "Dashboard" (B6:G17) file bulan ini.'}
        </div>
      </div>
    );
  }
  const last = t.cols.length - 1;
  const isTotalCol = (i: number) => /^total$/i.test(t.cols[i]);
  // the sheet's own Total row; summed from the staff rows only when the sheet has none
  const total = t.total ?? t.cols.map((_, i) => t.rows.reduce((a, r) => a + r.values[i], 0));
  const grand = total[last] || 0;

  return (
    <div className="sd-content">
      {intro}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {t.cols.map((c, i) => (
          <article key={c} className={`sd-block-card p-3.5 sm:p-5 ${isTotalCol(i) ? "max-md:col-span-2" : ""}`} data-tone={isTotalCol(i) ? "blue" : undefined}>
            <p className="text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">{isTotalCol(i) ? "Total Store" : c}</p>
            <p className="sd-num mt-2 font-black">{rpf(total[i])}</p>
            <p className="text-[11px] font-bold text-slate-500 sm:text-xs">
              ≈ {rpc(total[i] / dim)} / hari{!isTotalCol(i) && grand ? ` · ${pct((total[i] / grand) * 100, 0)} dari total` : ""}
            </p>
          </article>
        ))}
      </div>

      <Panel title="Target per Staff" desc={`Sesuai tabel di sheet. Target harian = target bulanan ÷ ${dim} hari.`}>
        {/* phone: one card per staff */}
        <div className="space-y-2 md:hidden">
          {t.rows.map((r) => (
            <div key={r.name} className={`rounded-2xl border border-slate-200 p-3 dark:border-slate-700 ${r.values.every((v) => !v) ? "opacity-60" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold">{r.name}</p>
                <p className="font-black tabular-nums">{rpf(r.values[last])}</p>
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 border-t border-dashed border-slate-200 pt-2 text-sm dark:border-slate-700">
                {t.cols.slice(0, last).map((c, i) => (
                  <li key={c} className="flex min-w-0 justify-between gap-1.5 text-[13px]">
                    <span className="text-slate-500">{c}</span>
                    <b className="tabular-nums">{rpc(r.values[i])}</b>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-950/40">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-black text-blue-700 dark:text-blue-300">TOTAL STORE</p>
              <p className="font-black tabular-nums">{rpf(total[last])}</p>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 border-t border-dashed border-blue-200 pt-2 text-sm dark:border-blue-800">
              {t.cols.slice(0, last).map((c, i) => (
                <li key={c} className="flex min-w-0 justify-between gap-1.5 text-[13px]">
                  <span className="text-slate-500">{c}</span>
                  <b className="tabular-nums">{rpc(total[i])}</b>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="sd-table-wrap hidden md:block">
          <table className="sd-table">
            <thead>
              <tr>
                <th>Nama</th>
                {t.cols.map((c, i) => <th key={c} className={`n ${isTotalCol(i) ? "!bg-blue-100 !text-blue-800 dark:!bg-blue-950 dark:!text-blue-200" : ""}`}>{c}</th>)}
                <th className="n">Per hari</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r) => (
                <tr key={r.name} className={r.values.every((v) => !v) ? "text-slate-400" : ""}>
                  <td className="font-bold">{r.name}</td>
                  {r.values.map((v, i) => <td key={i} className={`n tabular-nums ${isTotalCol(i) ? "bg-blue-50 font-black dark:bg-blue-950/40" : ""}`}>{rpf(v)}</td>)}
                  <td className="n text-slate-500 tabular-nums">{rpc(r.values[last] / dim)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL STORE</td>
                {total.map((v, i) => <td key={i} className={`n tabular-nums ${isTotalCol(i) ? "bg-blue-100 dark:bg-blue-950" : ""}`}>{rpf(v)}</td>)}
                <td className="n tabular-nums">{rpc(total[last] / dim)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </div>
  );
}
