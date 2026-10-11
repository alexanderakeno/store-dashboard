import { PageIntro, Panel } from "@/components/kit";
import { ParamDate } from "@/components/kit/controls";
import { ChecklistForm } from "@/components/modules/RecordForms";
import { dateLong } from "@/lib/format";
import { records } from "@/lib/records";

export interface ChecklistSection {
  section: string;
  tasks: string[];
}

export async function ChecklistPage({ role, items, date, canEdit }: { role: "SPV" | "Staff"; items: ChecklistSection[]; date: string; canEdit: boolean }) {
  const kind = role === "SPV" ? "checklist-spv" : "checklist-staff";
  const rec = await records(kind, date);
  const done = rec.filter((r) => r.data.done).map((r) => r.key);
  const all = items.flatMap((s) => s.tasks.map((t) => `${s.section}: ${t}`));
  const count = all.filter((k) => done.includes(k)).length;
  return (
    <div className="sd-content">
      <PageIntro title={`Checklist Store - ${role}`} desc={`Checklist harian ${role === "SPV" ? "supervisor" : "staff"} • ${dateLong(date)}`} />
      <section className="sd-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <span className={`grid size-12 place-items-center rounded-2xl text-lg font-black ${count === all.length ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{count}/{all.length}</span>
          <div><p className="font-black">Progress {dateLong(date)}</p><p className="text-sm text-slate-500">{count === all.length ? "Semua item selesai." : `${all.length - count} item belum dicentang.`}</p></div>
        </div>
        <ParamDate param="date" label="Tanggal" value={date} className="w-48" />
      </section>
      <Panel title="Checklist" desc={canEdit ? "Centang item yang sudah dikerjakan lalu Simpan." : "Hanya admin yang bisa mengubah checklist."}>
        <ChecklistForm kind={kind} date={date} items={all} initial={done} canEdit={canEdit} />
      </Panel>
    </div>
  );
}
