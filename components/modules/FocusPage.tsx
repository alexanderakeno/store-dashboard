import Link from "next/link";
import { appConfig } from "@/config/app";
import { EmptyBlock, NeedData, PageIntro, Panel, Progress, achColor } from "@/components/kit";
import { ParamDate, ParamSelect, PrintButton, WhatsAppButton } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { breakdown } from "@/lib/domain/kpi";
import { displayName, nameKey } from "@/lib/domain/normalize";
import { VAS_PROVIDERS, clampRange, linesByStaff } from "@/lib/domain/extra";
import { daysInMonth, eachDay, monthStart, weeksOfMonth } from "@/lib/domain/period";
import { focusKey } from "@/lib/domain/views";
import { dateShort, monthLabel, num, pct, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";
import type { Group } from "@/types/domain";

interface Props {
  searchParams: SearchParams;
  path: string;
  group: Group;
  title: string;
  desc: string;
  itemLabel: string; // "Product" / "Supplier" / "Provider"
}

type Status = "On Track" | "Warning" | "Critical" | "No Target";
const statusOf = (ach: number | null, tg: number): Status => (ach == null ? "No Target" : ach >= tg ? "On Track" : ach >= tg * 0.7 ? "Warning" : "Critical");
const statusTone: Record<Status, string> = { "On Track": "green", Warning: "amber", Critical: "red", "No Target": "slate" };

export async function FocusPage({ searchParams, path, group, title, desc, itemLabel }: Props) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title={title} p={p} />;
  const s = p.snap;
  const cfg = appConfig();
  const dim = daysInMonth(p.month);
  const per = p.q.per === "month" || p.q.per === "range" ? p.q.per : "week";
  const weeks = weeksOfMonth(p.month);
  const curWeek = weeks.find((w) => p.asOf >= w.start && p.asOf <= w.end) ?? weeks[0];
  const wk = weeks.find((w) => String(w.index) === p.q.wk) ?? curWeek;
  let from: string, to: string;
  if (per === "week") ({ from, to } = { from: wk.start, to: wk.end < p.asOf ? wk.end : p.asOf });
  else if (per === "range") ({ from, to } = clampRange(p.month, p.asOf, p.q.from, p.q.to));
  else ({ from, to } = { from: monthStart(p.month), to: p.asOf });
  const periodDays = per === "week" ? eachDay(wk.start, wk.end).length : per === "range" ? eachDay(from, to).length : dim;
  const scale = periodDays / dim;
  const tg = to < from ? 0 : (eachDay(from, to).length / periodDays) * 100;
  const ls = s.lines.filter((l) => l.date >= from && l.date <= to);

  const section = s.target?.sections[group];
  const cols = section?.columns ?? [];
  const pool = group === "ACC" ? s.rules.supplierOrder : group === "VAS" ? [...VAS_PROVIDERS] : [];
  const extra = pool.filter((x) => !cols.some((c) => nameKey(c) === nameKey(x)));
  const actualRows = breakdown(ls, (l) => focusKey(group, l), { qtyAll: true });
  const used = new Set<string>();
  const items = [...cols, ...extra].map((col) => {
    const m = actualRows.filter((r) => nameKey(r.key) === nameKey(col));
    m.forEach((r) => used.add(r.key));
    const target = (section?.columnTargets[col] ?? 0) * scale;
    const actual = m.reduce((a, r) => a + r.sales, 0);
    return { key: col, actual, qty: m.reduce((a, r) => a + r.qty, 0), target, ach: target ? (actual / target) * 100 : null };
  });
  for (const r of actualRows) if (!used.has(r.key) && r.sales !== 0) items.push({ key: r.key, actual: r.sales, qty: r.qty, target: 0, ach: null });
  const counted = items.filter((x) => !(group === "Apple" && x.key === "AirPods"));
  const totalTarget = counted.reduce((a, x) => a + x.target, 0);
  const totalActual = counted.reduce((a, x) => a + x.actual, 0);
  const totalQty = items.reduce((a, x) => a + x.qty, 0);
  const totalAch = totalTarget ? (totalActual / totalTarget) * 100 : null;
  const sel = items.find((x) => x.key === p.q.item) ?? items[0];
  const selLines = sel ? ls.filter((l) => focusKey(group, l) != null && nameKey(focusKey(group, l)) === nameKey(sel.key)) : [];
  const perStaff = [...linesByStaff(selLines).entries()]
    .map(([k, xs]) => ({ k, name: displayName(xs[0].staffName), value: xs.reduce((a, l) => a + l.amount, 0), qty: xs.reduce((a, l) => a + l.qty, 0) }))
    .sort((a, b) => b.value - a.value);
  const staffTargetCol = (name: string) => {
    const st = s.target?.staff.find((x) => nameKey(x.name) === nameKey(name));
    return st && sel ? (st.byColumn[`${group}:${sel.key}`] ?? 0) * scale : 0;
  };

  const periodLabel = per === "week" ? `${wk.label} (${dateShort(wk.start)} – ${dateShort(wk.end)})` : per === "range" ? `${dateShort(from)} – ${dateShort(to)}` : monthLabel(p.month);
  const share = [
    `*${cfg.storeName || "Store"} — ${title}*`,
    `Periode: ${periodLabel}`,
    `Target ${rpf(totalTarget)} · Ach ${rpf(totalActual)} (${pct(totalAch ?? 0, 1)}) · Gap ${rpf(totalTarget - totalActual)}`,
    "",
    ...items.map((x) => `${x.key}: ${rpf(x.actual)} / ${rpf(x.target)} (${x.ach == null ? "–" : pct(x.ach, 0)}) · ${num(x.qty)} unit`),
  ].join("\n");

  return (
    <div className="sd-content">
      <PageIntro eyebrow={`${cfg.storeCode || "STORE"} • Target Fokus`} title={title} desc={desc} />
      <section className="sd-panel space-y-4 p-5">
        <div className="inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          {(["week", "month", "range"] as const).map((k) => (
            <Link key={k} href={withQuery(path, p.q, { per: k === "week" ? null : k, wk: null, from: null, to: null })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${per === k ? "bg-slate-500 text-white shadow-sm" : "text-slate-500"}`}>
              {k === "week" ? "Week" : k === "month" ? "Bulan" : "Range Tanggal"}
            </Link>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {per === "week" && <ParamSelect param="wk" label="Week (Minggu–Sabtu)" value={String(wk.index)} options={weeks.map((w) => ({ value: String(w.index), label: `${w.label} · ${dateShort(w.start)}–${dateShort(w.end)}`, disabled: w.start > p.asOf }))} />}
          {per === "month" && <ParamSelect param="m" label="Bulan" value={p.month} reset={["d"]} options={p.months.map((m) => ({ value: m.month, label: monthLabel(m.month) }))} />}
          {per === "range" && (
            <>
              <ParamDate param="from" label="Dari" value={from} min={monthStart(p.month)} max={p.asOf} />
              <ParamDate param="to" label="Sampai" value={to} min={monthStart(p.month)} max={p.asOf} />
            </>
          )}
        </div>
        <p className="text-xs text-slate-500">Periode aktif: <b>{periodLabel}</b> · time gone periode {pct(tg)} · target dipro-rata {periodDays}/{dim} hari.</p>
      </section>

      <Panel title="Share Report" desc="Tabel WA • seluruh item sesuai dashboard" right={<div className="flex flex-wrap gap-2"><PrintButton /><WhatsAppButton text={share} /></div>} />

      {!section && <EmptyBlock title={`Target ${group} per ${itemLabel.toLowerCase()} belum terbaca`}>Kolom target dibaca dari tab Target Store (baris Target (IDR)). Actual tetap ditampilkan.</EmptyBlock>}

      <section className="sd-panel p-5">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>Total Target: <b>{rpf(totalTarget)}</b></span>
          <span>Achievement: <b>{rpf(totalActual)}</b> ({pct(totalAch ?? 0)})</span>
          <span>Gap: <b>{rpf(Math.max(0, totalTarget - totalActual))}</b></span>
          <span>Actual Qty: <b>{num(totalQty)} unit</b></span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {items.map((x) => (
            <Link key={x.key} href={withQuery(path, p.q, { item: x.key })} className={`rounded-2xl border px-4 py-2.5 text-left transition hover:-translate-y-0.5 ${sel?.key === x.key ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white dark:border-slate-700"}`}>
              <p className="text-sm font-black text-slate-950">{x.key}</p>
              <p className="text-xs font-bold" style={{ color: achColor(x.ach, tg) }}>{x.ach == null ? "tanpa target" : pct(x.ach)}</p>
            </Link>
          ))}
          {!items.length && <p className="text-sm text-slate-500">Belum ada item.</p>}
        </div>
      </section>

      {sel && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Panel title={<span className="flex items-center gap-2">{sel.key}<span className={`sd-badge ${statusTone[statusOf(sel.ach, tg)]}`}>{statusOf(sel.ach, tg)}</span></span>} desc={`${itemLabel.toUpperCase()} DIPILIH`}>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-slate-500">Target Value</p><p className="text-lg font-black">{sel.target ? rpf(sel.target) : <NeedData />}</p></div>
              <div><p className="text-xs text-slate-500">Achievement</p><p className="text-lg font-black">{rpf(sel.actual)}</p></div>
              <div><p className="text-xs text-slate-500">Achievement %</p><p className="text-lg font-black">{sel.ach == null ? "—" : pct(sel.ach)}</p></div>
              <div><p className="text-xs text-slate-500">Actual Qty</p><p className="text-lg font-black">{num(sel.qty)} unit</p></div>
            </div>
            <div className="mt-4"><Progress value={sel.ach} tick={tg} color={achColor(sel.ach, tg)} label={`Achievement ${sel.key}`} /></div>
            {group === "Apple" && sel.key === "AirPods" && <p className="mt-3 text-xs text-slate-500">AirPods tampil di LOB Apple, nilainya dihitung di ACC.</p>}
          </Panel>
          <Panel title="Kontribusi Staff" desc={`${sel.key} per staff pada periode ini.`}>
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead><tr><th>Staff</th><th className="n">Target</th><th className="n">Value</th><th className="n">Qty</th><th className="n">%</th></tr></thead>
                <tbody>
                  {perStaff.map((r) => {
                    const t = staffTargetCol(r.name);
                    return <tr key={r.k}><td className="font-bold">{r.name}</td><td className="n">{t ? rpf(t) : "—"}</td><td className="n">{rpf(r.value)}</td><td className="n">{num(r.qty)}</td><td className="n">{t ? pct((r.value / t) * 100, 0) : "—"}</td></tr>;
                  })}
                  {!perStaff.length && <tr><td colSpan={5} className="text-center text-slate-500">Belum ada penjualan.</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      <Panel title={`Semua ${itemLabel}`}>
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead><tr><th>{itemLabel}</th><th className="n">Target</th><th className="n">Actual</th><th className="n">Qty</th><th style={{ minWidth: 160 }}>Ach</th><th className="n">Gap</th><th>Status</th></tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.key}>
                  <td className="font-bold">{x.key}</td>
                  <td className="n">{x.target ? rpf(x.target) : "—"}</td>
                  <td className="n">{rpf(x.actual)}</td>
                  <td className="n">{num(x.qty)}</td>
                  <td><div className="flex items-center gap-2"><div className="flex-1"><Progress value={x.ach} tick={tg} color={achColor(x.ach, tg)} label={x.key} /></div><b className="w-12 text-right text-xs">{x.ach == null ? "—" : pct(x.ach, 0)}</b></div></td>
                  <td className={`n ${x.actual - x.target >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{x.target ? rpf(x.actual - x.target) : "—"}</td>
                  <td><span className={`sd-badge ${statusTone[statusOf(x.ach, tg)]}`}>{statusOf(x.ach, tg)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
