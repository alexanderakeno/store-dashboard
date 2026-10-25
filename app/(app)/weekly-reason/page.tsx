import { appConfig } from "@/config/app";
import { EmptyBlock, PageIntro, Panel } from "@/components/kit";
import { NoteEditor } from "@/components/modules/RecordForms";
import { records } from "@/lib/records";
import { ParamSelect } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { staffStats, typeQty } from "@/lib/domain/extra";
import { totals } from "@/lib/domain/kpi";
import { daysInMonth, eachDay, weeksOfMonth } from "@/lib/domain/period";
import { dateShort, dmy, num, pct, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { getSoh, stockKosong } from "@/lib/soh";
import type { MonthSnapshot } from "@/lib/services/dashboard";
import Link from "next/link";

export default async function WeeklyReasonPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Weekly Reason" p={p} />;
  const s = p.snap;
  const weeks = weeksOfMonth(p.month).filter((w) => w.start <= p.asOf);
  const wk = weeks.find((w) => String(w.index) === p.q.wk) ?? weeks[weeks.length - 1];
  const end = wk.end < p.asOf ? wk.end : p.asOf;
  const ls = s.lines.filter((l) => l.date >= wk.start && l.date <= end);
  const t = totals(ls);
  const days = eachDay(wk.start, wk.end).length;
  const scale = days / daysInMonth(p.month);
  const tg = (eachDay(wk.start, end).length / days) * 100;
  const target = (s.target?.total ?? 0) * scale;
  const staff = staffStats(ls, s.target, tg, { targetScale: scale });
  const moves = typeQty(ls).sort((a, b) => b.qty - a.qty).slice(0, 10);
  const isAdmin = p.session.role === "admin";
  const rec = await records("reason", wk.start);
  const rows = rec.map((r) => ({ key: r.key, data: r.data }));
  const noteOf = (name: string) => String(rec.find((r) => r.key === name)?.data.text ?? "");
  return (
    <div className="sd-content">
      <PageIntro eyebrow={`${appConfig().storeCode || "STORE"} Reporting`} title="Weekly Reason" desc="Weekly sales actual, reason staff, product movement dan kondisi SOH." />
      <section className="sd-panel grid gap-3 p-5 sm:grid-cols-2">
        <ParamSelect param="wk" label="Pilih Week" value={String(wk.index)} options={weeks.map((w) => ({ value: String(w.index), label: `${w.label} · ${dateShort(w.start)}–${dateShort(w.end)}` }))} />
        <div className="self-end text-sm text-slate-500">Sales {rpf(t.sales)} / target {rpf(target)} · <b>{pct(target ? (t.sales / target) * 100 : null, 0)}</b> · time gone week {pct(tg, 0)}</div>
      </section>
      <Panel title="Weekly Sales & Reason Staff" desc="Reason disimpan per staff per week.">
        <div className="sd-table-wrap"><table className="sd-table">
          <thead><tr><th>Staff</th><th className="n">Target Week</th><th className="n">Actual</th><th className="n">%</th><th>Status</th><th>Reason</th></tr></thead>
          <tbody>{staff.map((r) => (
            <tr key={r.key}><td className="font-bold">{r.name}</td><td className="n">{rpf(r.target)}</td><td className="n">{rpf(r.totals.sales)}</td><td className="n">{pct(r.achievementPct ?? 0, 0)}</td>
              <td><span className={`sd-badge ${r.onPace ? "green" : "red"}`}>{r.onPace ? "On Track" : "Behind"}</span></td>
              <td className="min-w-72 !whitespace-normal">{isAdmin ? <NoteEditor kind="reason" date={wk.start} keyName={r.name} initial={noteOf(r.name)} others={rows} label="Isi Reason" placeholder="Alasan pencapaian minggu ini…" /> : <span className="text-sm text-slate-600">{noteOf(r.name) || "—"}</span>}</td></tr>
          ))}</tbody>
        </table></div>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Product Movement" desc="Top 10 type Apple (qty) minggu ini.">
          <div className="sd-table-wrap"><table className="sd-table">
            <thead><tr><th>Type</th><th className="n">Qty</th><th className="n">Value</th></tr></thead>
            <tbody>{moves.map((m) => <tr key={m.type}><td className="font-bold">{m.type}</td><td className="n">{num(m.qty)}</td><td className="n">{rpf(m.value)}</td></tr>)}
              {!moves.length && <tr><td colSpan={3} className="text-center text-slate-500">Belum ada penjualan.</td></tr>}</tbody>
          </table></div>
        </Panel>
        <SohCondition snap={s} />
      </div>
    </div>
  );
}

/** Latest SOH per category plus what sold but is now empty (same rule as SOH → Stock Kosong). */
async function SohCondition({ snap }: { snap: MonthSnapshot }) {
  const soh = await getSoh().catch(() => undefined);
  if (!soh)
    return (
      <Panel title="Kondisi SOH">
        <EmptyBlock title="Kondisi SOH">{soh === null ? "Belum ada SOH — upload SOH (PDF / Excel) di Data Upload." : "SOH gagal dibaca saat ini, coba Perbarui."}</EmptyBlock>
      </Panel>
    );
  const { groups } = await stockKosong(soh, snap);
  const perCat = soh.categories.map((c) => ({ c, qty: soh.items.filter((x) => x.category === c).reduce((a, x) => a + x.qty, 0) }));
  const empty = groups.flatMap((g) => g.items.map((it) => ({ ...it, category: g.category }))).sort((a, b) => b.sold - a.sold);
  return (
    <Panel title="Kondisi SOH" desc={`Stok per ${soh.date ? dmy(soh.date) : "update terakhir"}.`} right={<Link href="/soh" prefetch={false} className="sd-btn">Buka SOH</Link>}>
      <div className="flex flex-wrap gap-1.5">
        {perCat.map(({ c, qty }) => <span key={c} className={`sd-badge ${qty ? "slate" : "red"}`}>{c} {num(qty)}</span>)}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-900 dark:text-white">Stock kosong yang laku (30 hari)</p>
        <Link href="/soh?v=kosong" prefetch={false} className="shrink-0 text-sm font-semibold text-blue-600 hover:underline">{empty.length} artikel ›</Link>
      </div>
      {empty.length ? (
        <ul className="mt-2 divide-y divide-slate-200 text-[13px] dark:divide-slate-700">
          {empty.slice(0, 8).map((it) => (
            <li key={it.article} className="flex justify-between gap-3 py-2">
              <span className="min-w-0"><span className="block truncate font-semibold">{it.description || it.article}</span><span className="text-[11px] text-slate-400">{it.category}</span></span>
              <span className="shrink-0 tabular-nums">sold <b>{num(it.sold)}</b></span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Semua device yang laku masih ada stoknya.</p>
      )}
    </Panel>
  );
}
