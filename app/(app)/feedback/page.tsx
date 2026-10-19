import { PageIntro, Panel } from "@/components/kit";
import { ParamDate } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { NoteEditor } from "@/components/modules/RecordForms";
import { byStaff } from "@/lib/domain/kpi";
import { displayName } from "@/lib/domain/normalize";
import { daysInMonth, monthStart } from "@/lib/domain/period";
import { dateLong, pct, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { records } from "@/lib/records";

export default async function FeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Feedback" p={p} />;
  const s = p.snap;
  const day = p.asOf;
  const isAdmin = p.session.role === "admin";
  const { staff } = byStaff(s.lines.filter((l) => l.date === day), s.target, 1 / daysInMonth(p.month));
  const below = staff.filter((r) => r.target > 0 && r.totals.sales < r.target);
  const rec = await records("feedback", day);
  const rows = rec.map((r) => ({ key: r.key, data: r.data }));
  const noteOf = (name: string) => String(rec.find((r) => r.key === displayName(name))?.data.text ?? "");
  const filled = below.filter((r) => noteOf(r.name)).length;
  return (
    <div className="sd-content">
      <PageIntro title="Feedback" desc="Pilih Isi Feedback langsung di samping nama staff yang belum mencapai target." />
      <section className="sd-panel grid gap-3 p-5 sm:grid-cols-[16rem_1fr] sm:items-end">
        <ParamDate param="d" label="Tanggal" value={day} min={monthStart(p.month)} max={s.lastDataDate ?? day} />
        <p className="text-sm text-slate-500">Target dan pencapaian tersimpan sesuai tanggal ({dateLong(day)}).</p>
      </section>
      <Panel title="Status Feedback Staff" desc={`${below.length - filled} dari ${below.length} staff belum mengisi feedback`}>
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {below.map((r) => (
            <li key={r.key} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 sm:min-w-48">
                <p className="font-bold text-slate-950">{displayName(r.name)} {noteOf(r.name) && <span className="sd-badge green ml-1">Sudah isi</span>}</p>
                <p className="text-sm text-slate-500">{pct((r.totals.sales / r.target) * 100, 0)} achievement • {rpf(r.totals.sales)} / {rpf(r.target)}</p>
              </div>
              <div className="w-full min-w-0 sm:w-auto sm:max-w-xl sm:flex-1">
                {isAdmin ? (
                  <NoteEditor kind="feedback" date={day} keyName={displayName(r.name)} initial={noteOf(r.name)} others={rows} label="Isi Feedback" placeholder="Kendala hari ini & rencana besok…" />
                ) : (
                  <p className="text-sm text-slate-600">{noteOf(r.name) ? `“${noteOf(r.name)}”` : "Belum ada feedback."}</p>
                )}
              </div>
            </li>
          ))}
          {!below.length && <li className="py-3 text-sm text-slate-500">{s.target ? "Semua staff mencapai target harian." : "Target staff belum terbaca dari Target Store."}</li>}
        </ul>
      </Panel>
    </div>
  );
}
