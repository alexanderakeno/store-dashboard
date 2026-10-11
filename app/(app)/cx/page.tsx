import { NeedData, PageIntro, Panel } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { staffNames } from "@/components/modules/staffList";
import { monthLabel } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";

export default async function CxPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="NPS/CX & Member" p={p} />;
  const names = staffNames(p.snap);
  return (
    <div className="sd-content">
      <PageIntro title="NPS / CX & Member" desc="Input harian dan rekap pencapaian CX & New Member per bulan." />
      <Panel title="Reminder Staff Hari Ini" desc="Staff yang belum mengisi CX / New Member." right={<NeedData />}>
        <div className="flex flex-wrap gap-2">{names.map((n) => <span key={n} className="sd-badge slate">{n}</span>)}</div>
      </Panel>
      <Panel title="Input CX & New Member" right={<NeedData label="Penyimpanan: Need Data" />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block"><span className="sd-label">Tanggal</span><input className="sd-input" type="date" disabled defaultValue={p.asOf} /></label>
          <label className="block"><span className="sd-label">Nama Staff</span><select className="sd-select" disabled><option>Pilih Staff</option>{names.map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="block"><span className="sd-label">Category: CX</span><input className="sd-input" disabled placeholder="Jumlah CX hari ini" /></label>
          <label className="block"><span className="sd-label">Category: New Member</span><input className="sd-input" disabled placeholder="Jumlah new member hari ini" /></label>
        </div>
        <button type="button" className="sd-btn dark mt-4" disabled>Simpan CX & New Member</button>
      </Panel>
      <Panel title="Rekap Bulanan" desc={`Pencapaian seluruh staff per hari · ${monthLabel(p.month)}`}>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700"><p className="text-xs text-slate-500">Total CX</p><p className="text-xl font-black">—</p></div>
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700"><p className="text-xs text-slate-500">Total New Member</p><p className="text-xl font-black">—</p></div>
        </div>
        <div className="sd-table-wrap"><table className="sd-table">
          <thead><tr><th>Tanggal</th><th className="n">Staff Input</th><th className="n">CX</th><th className="n">New Member</th></tr></thead>
          <tbody><tr><td colSpan={4} className="text-center text-slate-500">Sumber: tab &quot;CX&amp;GR Tracker&quot; di sheet bulanan — perlu dihubungkan.</td></tr></tbody>
        </table></div>
      </Panel>
    </div>
  );
}
