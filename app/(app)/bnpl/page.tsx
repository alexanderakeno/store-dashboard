import { PageIntro, Panel } from "@/components/kit";
import { MobileGrid } from "@/components/kit/MobileGrid";
import { PageStatus } from "@/components/layout/PageStatus";
import { BnplForm } from "@/components/modules/RecordForms";
import { monthEnd, monthStart, todayIn } from "@/lib/domain/period";
import { appConfig } from "@/config/app";
import { dayName, dmy, monthLabel, num, rpc, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { records } from "@/lib/records";

const BNPL = ["HCI", "Indodana", "Kredivo", "Akulaku", "SPayLater"];
const TRADE = ["Laku6 Master Device", "OnePulse"];
const ALL = [...BNPL, ...TRADE];

export default async function BnplPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="BNPL & Trade-In" p={p} />;
  const isAdmin = p.session.role === "admin";
  const rec = await records("bnpl", p.month);
  const byDay: Record<string, Record<string, { qty: number; amount: number }>> = {};
  for (const r of rec) (byDay[r.date] ??= {})[r.key] = { qty: Number(r.data.qty) || 0, amount: Number(r.data.amount) || 0 };
  const sum = (ps: string[]) => ps.reduce((a, k) => { for (const d of Object.values(byDay)) { a.qty += d[k]?.qty ?? 0; a.amount += d[k]?.amount ?? 0; } return a; }, { qty: 0, amount: 0 });
  const per = Object.fromEntries(ALL.map((k) => [k, sum([k])]));
  const tb = sum(BNPL);
  const tt = sum(TRADE);
  const days = Object.keys(byDay).sort();
  const now = todayIn(appConfig().timeZone);
  const today = now.startsWith(p.month) ? now : p.asOf;
  return (
    <div className="sd-content">
      <PageIntro title="BNPL & Trade-In" desc="Daily tracking dibuat seperti lembar kerja: provider menjadi kolom agar lebih cepat dibaca." />
      {isAdmin ? (
        <Panel title="Input Harian" desc="Isi qty dan amount per provider, lalu Simpan. Mengisi ulang tanggal yang sama akan menimpa data tanggal itu.">
          <BnplForm providers={ALL} date={today} initial={byDay} min={monthStart(p.month)} max={monthEnd(p.month)} />
        </Panel>
      ) : (
        <p className="text-sm text-slate-500">Input BNPL & Trade-In hanya untuk admin.</p>
      )}
      <Panel title="Monthly Summary" desc={`Qty dan Amount mengikuti bulan aktif (${monthLabel(p.month)}).`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {ALL.map((x) => <div key={x} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700"><p className="text-sm font-bold">{x}</p><p className="text-xs text-slate-500">{num(per[x].qty)} qty</p><p className="font-black">{rpf(per[x].amount)}</p></div>)}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Total BNPL</p><p className="font-black">{num(tb.qty)} qty · {rpf(tb.amount)}</p></div>
          <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Total Trade-In</p><p className="font-black">{num(tt.qty)} qty · {rpf(tt.amount)}</p></div>
          <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Total Keseluruhan</p><p className="font-black">{num(tb.qty + tt.qty)} qty · {rpf(tb.amount + tt.amount)}</p></div>
        </div>
      </Panel>
      <Panel title="Daily Tracking" desc="Qty dan Amount per provider dalam satu baris tanggal.">
        <MobileGrid
          cols={[{ label: "Tanggal" }, { label: "Qty", w: "2.4rem" }, { label: "Amount", w: "6.4rem" }]}
          rows={days.map((d) => {
            const t = ALL.reduce((a, x) => ({ qty: a.qty + (byDay[d][x]?.qty ?? 0), amount: a.amount + (byDay[d][x]?.amount ?? 0) }), { qty: 0, amount: 0 });
            const parts = ALL.filter((x) => byDay[d][x]?.qty || byDay[d][x]?.amount).map((x) => `${x} ${num(byDay[d][x].qty)} · ${rpc(byDay[d][x].amount)}`);
            return { key: d, cells: [<span key="d" className="font-bold">{dmy(d)} <span className="text-[11px] font-normal text-slate-500">{dayName(d)}</span></span>, num(t.qty), <b key="a">{rpf(t.amount)}</b>], sub: parts.join(" · ") || undefined };
          })}
          foot={["TOTAL", num(tb.qty + tt.qty), rpf(tb.amount + tt.amount)]}
          empty="Belum ada input bulan ini."
        />
        <div className="sd-table-wrap max-sm:hidden"><table className="sd-table">
          <thead>
            <tr><th rowSpan={2}>Tanggal</th><th rowSpan={2}>Hari</th>{ALL.map((x) => <th key={x} colSpan={2} className="c">{x}</th>)}</tr>
            <tr>{ALL.map((x) => [<th key={`${x}q`} className="n">Qty</th>, <th key={`${x}a`} className="n">Amount</th>])}</tr>
          </thead>
          <tbody>
            {days.map((d) => <tr key={d}><td>{dmy(d)}</td><td>{dayName(d)}</td>{ALL.map((x) => [<td key={`${x}q`} className="n">{byDay[d][x]?.qty || "-"}</td>, <td key={`${x}a`} className="n">{byDay[d][x]?.amount ? rpf(byDay[d][x].amount) : "-"}</td>])}</tr>)}
            {!days.length && <tr><td colSpan={2 + ALL.length * 2} className="text-center text-slate-500">Belum ada input bulan ini.</td></tr>}
          </tbody>
          <tfoot><tr><td>TOTAL</td><td />{ALL.map((x) => [<td key={`${x}q`} className="n">{num(per[x].qty)}</td>, <td key={`${x}a`} className="n">{rpf(per[x].amount)}</td>])}</tr></tfoot>
        </table></div>
      </Panel>
    </div>
  );
}
