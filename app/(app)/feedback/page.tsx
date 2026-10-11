import { NeedData, PageIntro, Panel } from "@/components/kit";
import { ParamDate } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { byStaff } from "@/lib/domain/kpi";
import { displayName } from "@/lib/domain/normalize";
import { daysInMonth, monthStart } from "@/lib/domain/period";
import { dateLong, pct, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";

export default async function FeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Feedback" p={p} />;
  const s = p.snap;
  const day = p.asOf;
  const { staff } = byStaff(s.lines.filter((l) => l.date === day), s.target, 1 / daysInMonth(p.month));
  const below = staff.filter((r) => r.target > 0 && r.totals.sales < r.target);
  return (
    <div className="sd-content">
      <PageIntro title="Feedback" desc="Pilih Isi Feedback langsung di samping nama staff yang belum mencapai target." />
      <section className="sd-panel grid gap-3 p-5 sm:grid-cols-[16rem_1fr] sm:items-end">
        <ParamDate param="d" label="Tanggal" value={day} min={monthStart(p.month)} max={s.lastDataDate ?? day} />
        <p className="text-sm text-slate-500">Target dan pencapaian tersimpan sesuai tanggal ({dateLong(day)}).</p>
      </section>
      <Panel title="Status Feedback Staff" desc={`${below.length} staff perlu mengisi feedback`} right={<NeedData label="Penyimpanan feedback: Need Data" />}>
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {below.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-bold text-slate-950">{displayName(r.name)}</p>
                <p className="text-sm text-slate-500">{pct((r.totals.sales / r.target) * 100, 0)} achievement • {rpf(r.totals.sales)} / {rpf(r.target)}</p>
              </div>
              <button type="button" className="sd-btn" disabled title="Butuh tab penyimpanan feedback di master sheet">Isi Feedback</button>
            </li>
          ))}
          {!below.length && <li className="py-3 text-sm text-slate-500">{s.target ? "Semua staff mencapai target harian." : "Target staff belum terbaca dari Target Store."}</li>}
        </ul>
        <p className="mt-3 text-xs text-slate-500">Daftar staff dihitung otomatis dari data penjualan. Form isi feedback aktif setelah tab penyimpanan (mis. <code>APP_Feedback</code>) disiapkan.</p>
      </Panel>
    </div>
  );
}
