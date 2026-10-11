import Link from "next/link";
import { NeedData, PageIntro, Panel } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { eachDay, monthStart } from "@/lib/domain/period";
import { dayName, dmy, monthLabel } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";

const BNPL = ["HCI", "Indodana", "Kredivo", "Akulaku", "SPayLater"];
const TRADE = ["Laku6 Master Device", "OnePulse"];

export default async function BnplPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="BNPL & Trade-In" p={p} />;
  const tab = p.q.tab === "trade" ? "trade" : "bnpl";
  const providers = [...BNPL, ...TRADE];
  const days = eachDay(monthStart(p.month), p.asOf);
  return (
    <div className="sd-content">
      <PageIntro title="BNPL & Trade-In" desc="Daily tracking dibuat seperti lembar kerja: provider menjadi kolom agar lebih cepat dibaca." />
      <Panel right={<NeedData label="Input: Need Data" />}>
        <div className="mb-4 inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          <Link href={withQuery("/bnpl", p.q, { tab: null })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === "bnpl" ? "bg-white shadow-sm" : "text-slate-500"}`}>BNPL</Link>
          <Link href={withQuery("/bnpl", p.q, { tab: "trade" })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === "trade" ? "bg-white shadow-sm" : "text-slate-500"}`}>Trade In</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className="block"><span className="sd-label">Tanggal</span><input className="sd-input" type="date" disabled defaultValue={p.asOf} /></label>
          {(tab === "bnpl" ? BNPL : TRADE).map((x) => <label key={x} className="block"><span className="sd-label">{x}</span><input className="sd-input" disabled placeholder="Qty · Amount" /></label>)}
        </div>
        <button type="button" className="sd-btn dark mt-4" disabled>Simpan</button>
      </Panel>
      <Panel title="Monthly Summary" desc={`Qty dan Amount mengikuti bulan aktif (${monthLabel(p.month)}).`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {providers.map((x) => <div key={x} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700"><p className="text-sm font-bold">{x}</p><p className="text-xs text-slate-500">— qty</p><p className="font-black">—</p></div>)}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {["Total BNPL", "Total Trade-In", "Total Keseluruhan"].map((x) => <div key={x} className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{x}</p><p className="font-black">— qty · —</p></div>)}
        </div>
      </Panel>
      <Panel title="Daily Tracking" desc="Qty dan Amount per provider dalam satu baris tanggal.">
        <div className="sd-table-wrap"><table className="sd-table">
          <thead>
            <tr><th rowSpan={2}>Tanggal</th><th rowSpan={2}>Hari</th>{providers.map((x) => <th key={x} colSpan={2} className="c">{x}</th>)}</tr>
            <tr>{providers.map((x) => [<th key={`${x}q`} className="n">Qty</th>, <th key={`${x}a`} className="n">Amount</th>])}</tr>
          </thead>
          <tbody>{days.map((d) => <tr key={d}><td>{dmy(d)}</td><td>{dayName(d)}</td>{providers.map((x) => [<td key={`${x}q`} className="n text-slate-400">-</td>, <td key={`${x}a`} className="n text-slate-400">-</td>])}</tr>)}</tbody>
        </table></div>
      </Panel>
    </div>
  );
}
