import { appConfig } from "@/config/app";
import { NeedData, PageIntro, Panel } from "@/components/kit";
import { ParamDate } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { staffNames } from "@/components/modules/staffList";
import { clampRange } from "@/lib/domain/extra";
import { monthStart } from "@/lib/domain/period";
import { loadPage, type SearchParams } from "@/lib/page";

const COLS = ["MacBook", "iPhone", "iPad", "Apple Watch", "Accessories", "Qoala"];

export default async function IncentivePage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Est. Incentive" p={p} />;
  const { from, to } = clampRange(p.month, p.asOf, p.q.from, p.q.to);
  const names = staffNames(p.snap);
  return (
    <div className="sd-content">
      <PageIntro eyebrow={appConfig().storeCode || "STORE"} title="Estimasi Incentive" desc="Default tanggal 1 bulan berjalan sampai tanggal data terakhir." />
      <section className="sd-panel grid gap-3 p-5 sm:grid-cols-3">
        <ParamDate param="from" label="Dari Tanggal" value={from} min={monthStart(p.month)} max={p.asOf} />
        <ParamDate param="to" label="Sampai Tanggal" value={to} min={monthStart(p.month)} max={p.asOf} />
        <label className="block"><span className="sd-label">Staff</span><select className="sd-select" disabled><option>Semua Staff</option></select></label>
      </section>
      <div className="sd-hero p-6">
        <p className="text-xs font-black tracking-[.12em] text-white/80 uppercase">Total Est. Incentive</p>
        <p className="mt-2 text-3xl font-black">Need Data</p>
        <p className="mt-1 text-sm text-white/80">{from} – {to}</p>
        <div className="mt-5 grid max-w-xl grid-cols-3 gap-3 text-sm">
          {["Device", "Accessories", "Qoala"].map((k) => <div key={k} className="rounded-2xl bg-white/15 p-3"><p className="text-white/80">{k}</p><p className="font-black">—</p></div>)}
        </div>
      </div>
      <Panel title="Rincian per Staff" right={<NeedData label="Skema incentive: Need Data" />}>
        <div className="sd-table-wrap"><table className="sd-table">
          <thead><tr><th>#</th><th>Nama</th>{COLS.map((c) => <th key={c} className="n">{c}</th>)}<th className="n">Contribution</th><th className="n">Total</th></tr></thead>
          <tbody>{names.map((n, i) => <tr key={n}><td>{i + 1}</td><td className="font-bold">{n}</td>{COLS.map((c) => <td key={c} className="n text-slate-400">—</td>)}<td className="n text-slate-400">—</td><td className="n text-slate-400">—</td></tr>)}</tbody>
        </table></div>
        <p className="mt-3 text-xs text-slate-500">Butuh skema incentive per kategori (nominal per unit / persentase) — setelah tersedia, angka dihitung otomatis dari data Sales Person.</p>
      </Panel>
    </div>
  );
}
