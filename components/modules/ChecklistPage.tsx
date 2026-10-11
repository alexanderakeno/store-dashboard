import { NeedData, PageIntro, Panel } from "@/components/kit";
import { dateLong } from "@/lib/format";

export function ChecklistPage({ role, items, date }: { role: "SPV" | "Staff"; items: Array<{ section: string; tasks: string[] }>; date: string }) {
  const total = items.reduce((a, s) => a + s.tasks.length, 0);
  return (
    <div className="sd-content">
      <PageIntro title={`Checklist Store - ${role}`} desc={`Checklist harian ${role === "SPV" ? "supervisor" : "staff"} • ${dateLong(date)}`} />
      <section className="sd-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-lg font-black text-emerald-600">0/{total}</span>
          <div><p className="font-black">Progress hari ini</p><p className="text-sm text-slate-500">Belum ada checklist tersimpan.</p></div>
        </div>
        <NeedData label="Penyimpanan checklist: Need Data" />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        {items.map((sec) => (
          <Panel key={sec.section} title={sec.section}>
            <ul className="space-y-2">
              {sec.tasks.map((t) => (
                <li key={t} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-700">
                  <input type="checkbox" disabled className="size-4" aria-label={t} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
      <p className="text-xs text-slate-500">Item checklist di atas adalah template. Daftar item & penyimpanan (tab master sheet) perlu ditentukan — <b>Need Data</b>.</p>
    </div>
  );
}
