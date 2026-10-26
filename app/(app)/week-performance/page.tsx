import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { NeedData, PageIntro, Panel, Progress, Trend, achColor } from "@/components/kit";
import { PrintButton, WhatsAppButton } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { appConfig } from "@/config/app";
import { productType, rangeConversion, startedWeeks } from "@/lib/domain/extra";
import { byStaff, totals } from "@/lib/domain/kpi";
import { displayName } from "@/lib/domain/normalize";
import { addDays, daysInMonth, eachDay } from "@/lib/domain/period";
import { dayName, dec, monthLabel, num, pct, rpc, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";
import { GROUPS, type SalesLine } from "@/types/domain";

/** Fixed-column grid that fits phones and desktops alike (name column takes the rest). */
function Grid({ cols, colsM, head, rows, foot }: { cols: string; colsM?: string; head: ReactNode[]; rows: Array<{ key: string; cells: ReactNode[]; sub?: ReactNode }>; foot?: ReactNode[] }) {
  // phones (< 640 px) may use narrower columns (`colsM`)
  const line = "grid items-center gap-x-2 px-3 sm:gap-x-3 grid-cols-[var(--gm)] sm:grid-cols-[var(--gd)]";
  const style = { "--gm": colsM ?? cols, "--gd": cols } as CSSProperties;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 text-[13px] sm:text-sm dark:border-slate-700">
      <div className={`${line} bg-slate-50 py-2 text-[10.5px] font-extrabold tracking-wide text-slate-500 uppercase dark:bg-slate-800/60`} style={style}>
        {head.map((h, i) => <span key={i} className={i ? "text-right" : ""}>{h}</span>)}
      </div>
      {rows.map((r) => (
        <div key={r.key} className="border-t border-slate-200 py-2 dark:border-slate-700">
          <div className={`${line} tabular-nums`} style={style}>
            {r.cells.map((c, i) => <span key={i} className={i ? "text-right whitespace-nowrap" : "min-w-0 break-words"}>{c}</span>)}
          </div>
          {r.sub && <div className="mt-1 px-3 text-[11px] leading-snug text-slate-500">{r.sub}</div>}
        </div>
      ))}
      {!rows.length && <p className="border-t border-slate-200 px-3 py-5 text-center text-slate-500 dark:border-slate-700">Belum ada data.</p>}
      {foot && (
        <div className={`${line} border-t border-slate-200 bg-slate-50 py-2 font-black tabular-nums dark:border-slate-700 dark:bg-slate-800/60`} style={style}>
          {foot.map((c, i) => <span key={i} className={i ? "text-right whitespace-nowrap" : ""}>{c}</span>)}
        </div>
      )}
    </div>
  );
}

const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "2026-10-18" → "18 Okt"; a range in one month → "18–24 Okt". */
const dm = (d: string) => `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}`;
const span = (a: string, b: string) => (a === b ? dm(a) : a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))}–${dm(b)}` : `${dm(a)}–${dm(b)}`);

/**
 * Weekly Performance: one week (Sunday–Saturday, cut at the month's edges like every week in the app) —
 * sales vs the week's target (monthly target ÷ days in month × days in the week), day by day, per group,
 * per staff, top products and the month's week-by-week trend.
 */
export default async function WeekPerformancePage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Weekly Performance" p={p} />;
  const s = p.snap;
  const dim = daysInMonth(p.month);
  const weeks = startedWeeks(p.month, p.asOf);
  const cur = weeks.find((w) => String(w.index) === p.q.w) ?? weeks.find((w) => w.start <= p.asOf && p.asOf <= w.end) ?? weeks[weeks.length - 1];
  const prev = weeks.find((w) => w.index === cur.index - 1) ?? null;

  const upTo = (end: string) => (end < p.asOf ? end : p.asOf);
  const linesOf = (w: { start: string; end: string }) => s.lines.filter((l) => l.date >= w.start && l.date <= upTo(w.end));
  const tgtOf = (w: { start: string; end: string }, total = s.target?.total ?? 0) => (total / dim) * eachDay(w.start, w.end).length;

  const B = linesOf(cur);
  const tb = totals(B);
  const days = eachDay(cur.start, cur.end);
  const running = cur.end > p.asOf;
  // while the week is running, compare like-for-like: the previous week up to the same weekday (e.g. Sun–Mon vs Sun–Mon)
  const prevCut = prev && running ? addDays(prev.end, -(6 - new Date(`${p.asOf}T00:00:00Z`).getUTCDay())) : prev?.end;
  const ta = prev && prevCut && prevCut >= prev.start ? totals(linesOf({ start: prev.start, end: prevCut })) : null;
  const elapsed = eachDay(cur.start, upTo(cur.end)).length;
  const tg = (elapsed / days.length) * 100;
  const target = tgtOf(cur);
  const ach = target ? (tb.sales / target) * 100 : null;
  const growth = ta && ta.sales ? ((tb.sales - ta.sales) / ta.sales) * 100 : null;
  const conv = rangeConversion(s, cur.start, upTo(cur.end));
  const dailyTarget = (s.target?.total ?? 0) / dim;

  // day by day (Sunday → Saturday); days after the data date are "belum"
  const byDay = new Map<string, SalesLine[]>();
  for (const l of B) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l]);
  const dayRows = days.map((d) => ({ date: d, future: d > p.asOf, t: totals(byDay.get(d) ?? []) }));
  const peak = Math.max(dailyTarget, ...dayRows.map((r) => r.t.sales)) * 1.12 || 1;
  const best = dayRows.filter((r) => !r.future).sort((a, b) => b.t.sales - a.t.sales)[0];

  // staff: target scaled to the week's days
  const { staff, channels } = byStaff(B, s.target, days.length / dim);
  const people = [...staff, ...channels].filter((r) => r.totals.lines || r.target).sort((a, b) => b.totals.sales - a.totals.sales);

  // top products: devices (Apple & Android) and AirPods by qty
  const prod = new Map<string, { type: string; qty: number; value: number }>();
  for (const l of B) {
    if (!l.countsInQty || !(l.group === "Apple" || l.group === "Android" || l.lob === "AirPods")) continue;
    const k = productType(l);
    const e = prod.get(k) ?? { type: k, qty: 0, value: 0 };
    e.qty += l.qty;
    e.value += l.amount;
    prod.set(k, e);
  }
  const top = [...prod.values()].sort((a, b) => b.qty - a.qty || b.value - a.value).slice(0, 10);

  // the month's weeks
  const trend = weeks.map((w) => {
    const t = totals(linesOf(w)).sales;
    const tt = tgtOf(w);
    return { w, sales: t, ach: tt ? (t / tt) * 100 : null };
  });
  const trendMax = Math.max(1, ...trend.map((x) => x.sales));

  const range = span(cur.start, cur.end);
  const share = [
    `*${appConfig().storeName || "Store"} — Weekly Performance W${cur.index}*`,
    `${range} ${p.month.slice(0, 4)}${running ? ` (s/d ${dm(p.asOf)})` : ""}`,
    "",
    `Sales: ${rpf(tb.sales)} / target ${rpf(target)} (${pct(ach)})${growth == null ? "" : ` · vs W${prev!.index}${running ? " (hari yg sama)" : ""} ${growth >= 0 ? "+" : ""}${pct(growth)}`}`,
    ...GROUPS.map((g) => {
      const t = tgtOf(cur, s.target?.byGroup[g] ?? 0);
      return `${g}: ${rpf(tb.byGroup[g])} (${t ? pct((tb.byGroup[g] / t) * 100) : "–"})`;
    }),
    `Invoice ${num(tb.invoices)} · Qty ${num(tb.qty)} · UPT ${dec(tb.upt, 2).replace(",", ".")} · ATV ${rpf(tb.atv)}${conv.cvr == null ? "" : ` · CVR ${pct(conv.cvr)}`}`,
    "",
    "*Staff*",
    ...people.filter((r) => !r.isChannel).map((r, i) => `${i + 1}. ${displayName(r.name)} ${rpf(r.totals.sales)}${r.target ? ` (${pct((r.totals.sales / r.target) * 100, 0)})` : ""}`),
  ].join("\n");

  return (
    <div className="sd-content">
      <PageIntro
        title="Weekly Performance"
        desc={`Pencapaian per week (Minggu–Sabtu) · ${monthLabel(p.month)} · target week = target bulanan ÷ ${dim} × hari dalam week.`}
        actions={<><PrintButton /><WhatsAppButton text={share} /></>}
      />

      <section className="sd-panel flex flex-wrap gap-1.5 p-3 sm:p-4" aria-label="Pilih week">
        {weeks.map((w) => (
          <Link
            key={w.index}
            href={withQuery("/week-performance", p.q, { w: String(w.index) })}
            prefetch={false}
            aria-current={w.index === cur.index ? "page" : undefined}
            className={`rounded-xl border px-3 py-1.5 text-sm font-bold ${w.index === cur.index ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900" : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200"}`}
          >
            W{w.index}
            <span className={`block text-[11px] font-semibold ${w.index === cur.index ? "opacity-75" : "text-slate-500"}`}>{span(w.start, w.end)}{w.end > p.asOf ? " · berjalan" : ""}</span>
          </Link>
        ))}
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <article className="sd-block-card p-3.5 sm:p-5" data-tone="blue">
          <p className="text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">Sales W{cur.index}</p>
          <p className="sd-num mt-2 font-black">{rpf(tb.sales)}</p>
          <p className="text-[11px] font-bold text-slate-500 sm:text-xs">dari target {target ? rpf(target) : <NeedData />}</p>
          <div className="mt-2"><Progress value={ach} tick={tg} color={achColor(ach, tg)} label="Sales week" /></div>
          <p className="mt-1 text-[11px] text-slate-500"><b className="text-slate-800 dark:text-slate-100">{pct(ach)}</b> · time gone {pct(tg, 0)}</p>
        </article>
        <article className="sd-block-card p-3.5 sm:p-5" data-tone="violet">
          <p className="text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">vs {prev ? `W${prev.index}` : "week lalu"}</p>
          <p className="mt-2 text-xl font-black">{growth == null ? "—" : <Trend value={growth} digits={1} />}</p>
          <p className="text-[11px] font-bold text-slate-500 sm:text-xs">{ta ? `${rpf(ta.sales)} di W${prev!.index}` : prev ? "Tidak ada hari pembanding" : "Week pertama bulan ini"}</p>
          {running && ta && <p className="mt-1 text-[11px] text-slate-400">Hari yang sama ({span(cur.start, p.asOf)} vs {span(prev!.start, prevCut!)}).</p>}
        </article>
        <article className="sd-block-card p-3.5 sm:p-5" data-tone="green">
          <p className="text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">Transaksi · UPT</p>
          <p className="mt-2 text-xl font-black">{num(tb.invoices)} · {dec(tb.upt, 2).replace(",", ".")}</p>
          <p className="text-[11px] font-bold text-slate-500 sm:text-xs">{num(tb.qty)} unit · ATV {rpc(tb.atv)}</p>
        </article>
        <article className="sd-block-card p-3.5 sm:p-5" data-tone="amber">
          <p className="text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">CVR</p>
          <p className="mt-2 text-xl font-black">{conv.cvr == null ? <NeedData /> : pct(conv.cvr)}</p>
          <p className="text-[11px] font-bold text-slate-500 sm:text-xs">{conv.daysWithTraffic ? `traffic ${num(conv.traffic)} · ${conv.daysWithTraffic} hari` : "Isi traffic di Settings"}</p>
        </article>
      </div>

      <Panel title="Harian Minggu–Sabtu" desc={`Batang = sales per hari · garis = target harian (${rpc(dailyTarget)}). Biru ≥ target, merah muda < target.`}>
        <div className="relative flex h-44 items-end gap-1.5 border-b border-slate-200 px-1 pt-5 sm:gap-3 dark:border-slate-700">
          {dailyTarget > 0 && (
            <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-amber-500" style={{ bottom: `${(dailyTarget / peak) * 100}%` }}>
              <span className="absolute -top-4 right-0 bg-white px-1 text-[10px] font-extrabold text-amber-700 dark:bg-slate-900">target/hari</span>
            </div>
          )}
          {dayRows.map((r) => (
            <div key={r.date} className="flex h-full flex-1 flex-col items-center justify-end">
              {!r.future && <span className="mb-0.5 text-[9.5px] font-extrabold whitespace-nowrap sm:text-[11px]">{rpc(r.t.sales).replace("Rp", "")}</span>}
              <div
                className={`w-full max-w-11 rounded-t-lg ${r.future ? "bg-[repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0_4px,transparent_4px,transparent_8px)]" : r.t.sales >= dailyTarget ? "bg-blue-600" : "bg-rose-300"}`}
                style={{ height: `${((r.future ? dailyTarget : r.t.sales) / peak) * 100}%` }}
                title={`${dayName(r.date)} ${dm(r.date)}: ${rpf(r.t.sales)}`}
              />
            </div>
          ))}
        </div>
        <div className="mb-4 flex gap-1.5 px-1 pt-1 sm:gap-3">
          {dayRows.map((r) => <span key={r.date} className="flex-1 text-center text-[11px] font-bold text-slate-500">{DAY_SHORT[new Date(r.date + "T00:00:00Z").getUTCDay()]}</span>)}
        </div>
        <Grid
          cols="minmax(3rem,1fr) 7.6rem 2.4rem 2.4rem 3.2rem"
          colsM="minmax(2.4rem,1fr) 4.4rem 1.7rem 1.8rem 2.6rem"
          head={["Hari", "Sales", "Inv", "UPT", "Ach"]}
          rows={dayRows.map((r) => ({
            key: r.date,
            cells: [
              <Link key="d" href={withQuery("/sales", { m: p.month }, { d: r.date })} prefetch={false} className="leading-tight text-blue-600"><b>{DAY_SHORT[new Date(r.date + "T00:00:00Z").getUTCDay()]}</b> <span className="text-[11px]">{Number(r.date.slice(8))}</span></Link>,
              r.future ? <span key="s" className="text-slate-400">belum</span> : <b key="s"><span className="sm:hidden">{rpc(r.t.sales)}</span><span className="max-sm:hidden">{rpf(r.t.sales)}</span></b>,
              r.future ? "" : num(r.t.invoices),
              r.future ? "" : dec(r.t.upt, 1).replace(",", "."),
              r.future || !dailyTarget ? "" : <span key="a" className={r.t.sales >= dailyTarget ? "font-bold text-emerald-600" : "font-bold text-rose-600"}>{pct((r.t.sales / dailyTarget) * 100, 0)}</span>,
            ],
          }))}
          foot={["Total", <span key="s"><span className="sm:hidden">{rpc(tb.sales)}</span><span className="max-sm:hidden">{rpf(tb.sales)}</span></span>, num(tb.invoices), dec(tb.upt, 1).replace(",", "."), pct(ach, 0)]}
        />
        {best && best.t.sales > 0 && <p className="mt-2 text-xs text-slate-500">Hari terbaik: <b>{dayName(best.date)} {dm(best.date)} · {rpf(best.t.sales)}</b></p>}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Per Grup" desc="Actual vs target week · garis = time gone week.">
          <Grid
            cols="minmax(3.6rem,1fr) 4.8rem 4.8rem 2.8rem"
            colsM="minmax(3rem,1fr) 4.2rem 4.2rem 2.6rem"
            head={["Grup", "Target", "Actual", "Ach"]}
            rows={GROUPS.map((g) => {
              const t = tgtOf(cur, s.target?.byGroup[g] ?? 0);
              const a = tb.byGroup[g];
              const c = t ? (a / t) * 100 : null;
              return { key: g, cells: [<b key="g">{g}</b>, t ? rpc(t) : "—", <b key="a">{rpc(a)}</b>, <b key="c">{pct(c, 0)}</b>], sub: <Progress value={c} tick={tg} color={achColor(c, tg)} label={g} /> };
            })}
            foot={["Total", rpc(target), rpc(tb.sales), pct(ach, 0)]}
          />
        </Panel>

        <Panel title={`Staff W${cur.index}`} desc={`Ranking sales week ini · target staff week = target bulanan staff ÷ ${dim} × ${days.length} hari.`}>
          <Grid
            cols="minmax(5rem,1fr) 5.4rem 3rem 2.2rem"
            colsM="minmax(4rem,1fr) 4.4rem 2.8rem 1.8rem"
            head={["Staff", "Sales", "%", "UPT"]}
            rows={people.map((r, i) => {
              const c = r.target ? (r.totals.sales / r.target) * 100 : null;
              return {
                key: r.key,
                cells: [
                  <span key="n" className="flex items-start gap-1.5"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-50 text-[10px] font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{i + 1}</span><b className="leading-tight">{displayName(r.name)}</b></span>,
                  <b key="s">{rpc(r.totals.sales)}</b>,
                  c == null ? <span key="c" className="text-slate-400">—</span> : <span key="c" className={`sd-badge ${c >= tg ? "green" : c >= tg * 0.8 ? "amber" : "red"} !px-1.5 !py-0 !text-[11px]`}>{pct(c, 0)}</span>,
                  dec(r.totals.upt ?? 0, 1).replace(",", "."),
                ],
                sub: <span className="ml-6">{r.isChannel ? "Online · " : ""}Target {rpc(r.target)} · ACC {rpc(r.totals.byGroup.ACC)} · VAS {rpc(r.totals.byGroup.VAS)} · {num(r.totals.invoices)} trx</span>,
              };
            })}
          />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={`Top Produk W${cur.index}`} desc="Device (Apple & Android) dan AirPods terlaris menurut qty.">
          <Grid
            cols="minmax(0,1fr) 2.2rem 5rem"
            head={["Tipe", "Qty", "Value"]}
            rows={top.map((x, i) => ({ key: x.type, cells: [<span key="t" className="flex gap-2"><b className="w-5 shrink-0 text-slate-400">{i + 1}</b>{x.type}</span>, <b key="q">{num(x.qty)}</b>, rpc(x.value)] }))}
          />
        </Panel>

        <Panel title="Tren Week Bulan Ini" desc="Sales per week dan % pencapaian target week. Ketuk week untuk membuka.">
          <div className="flex h-36 items-end gap-2 border-b border-slate-200 px-1 pt-5 sm:gap-4 dark:border-slate-700">
            {trend.map((x) => (
              <Link key={x.w.index} href={withQuery("/week-performance", p.q, { w: String(x.w.index) })} prefetch={false} className="flex h-full flex-1 flex-col items-center justify-end">
                <span className="mb-0.5 text-[10px] font-extrabold whitespace-nowrap sm:text-xs">{rpc(x.sales).replace("Rp", "")}</span>
                <div className={`w-full max-w-14 rounded-t-lg ${x.w.index === cur.index ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`} style={{ height: `${(x.sales / trendMax) * 100}%` }} />
              </Link>
            ))}
          </div>
          <div className="flex gap-2 px-1 pt-1 sm:gap-4">
            {trend.map((x) => (
              <span key={x.w.index} className="flex-1 text-center text-[11px] font-bold text-slate-500">
                W{x.w.index}
                <span className={`block ${x.ach != null && x.ach >= 100 ? "text-emerald-600" : ""}`}>{pct(x.ach, 0)}</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Week mengikuti kalender Minggu–Sabtu dan dipotong di awal/akhir bulan, jadi W pertama & terakhir bisa kurang dari 7 hari (targetnya ikut menyesuaikan).</p>
        </Panel>
      </div>
    </div>
  );
}
