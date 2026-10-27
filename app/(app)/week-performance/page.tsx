import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { NeedData, PageIntro, Panel, Progress, Trend, achColor } from "@/components/kit";
import { PrintButton, WhatsAppButton } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { appConfig } from "@/config/app";
import { lobBreakdown, productType, rangeConversion, startedWeeks, type QV } from "@/lib/domain/extra";
import { byStaff, totals } from "@/lib/domain/kpi";
import { displayName } from "@/lib/domain/normalize";
import { addDays, daysInMonth, eachDay } from "@/lib/domain/period";
import { dayName, dec, monthLabel, num, pct, rp, rpc, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";
import { GROUPS, type SalesLine, type StoreTarget } from "@/types/domain";

/** Fixed-column grid that fits phones and desktops alike (name column takes the rest). */
function Grid({ cols, colsM, head, rows, foot, hideM = [] }: { cols: string; colsM?: string; hideM?: number[]; head: ReactNode[]; rows: Array<{ key: string; cells: ReactNode[]; sub?: ReactNode; pop?: string; label?: string; className?: string }>; foot?: ReactNode[] }) {
  // phones (< 640 px) may use narrower columns (`colsM`)
  const line = "grid items-center gap-x-2 px-3 sm:gap-x-3 grid-cols-[var(--gm)] sm:grid-cols-[var(--gd)]";
  const style = { "--gm": colsM ?? cols, "--gd": cols } as CSSProperties;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 text-[13px] sm:text-sm dark:border-slate-700">
      <div className={`${line} bg-slate-50 py-2 text-[10.5px] font-extrabold tracking-wide text-slate-500 uppercase dark:bg-slate-800/60`} style={style}>
        {head.map((h, i) => <span key={i} className={`${i ? "text-right" : ""} ${hideM.includes(i) ? "max-sm:hidden" : ""}`}>{h}</span>)}
      </div>
      {rows.map((r) => (
        <div key={r.key} className={`relative border-t border-slate-200 py-2 dark:border-slate-700 ${r.pop ? "hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800/50" : ""} ${r.className ?? ""}`}>
          {r.pop && <button type="button" popoverTarget={r.pop} className="absolute inset-0 z-10 cursor-pointer" aria-label={r.label ?? "Lihat detail"} />}
          <div className={`${line} tabular-nums`} style={style}>
            {r.cells.map((c, i) => <span key={i} className={`${i ? "text-right whitespace-nowrap" : "min-w-0 break-words"} ${hideM.includes(i) ? "max-sm:hidden" : ""}`}>{c}</span>)}
          </div>
          {r.sub && <div className={`mt-1 px-3 text-[11px] leading-snug text-slate-500 ${hideM.length ? "sm:hidden" : ""}`}>{r.sub}</div>}
        </div>
      ))}
      {!rows.length && <p className="border-t border-slate-200 px-3 py-5 text-center text-slate-500 dark:border-slate-700">Belum ada data.</p>}
      {foot && (
        <div className={`${line} border-t border-slate-200 bg-slate-50 py-2 font-black tabular-nums dark:border-slate-700 dark:bg-slate-800/60`} style={style}>
          {foot.map((c, i) => <span key={i} className={`${i ? "text-right whitespace-nowrap" : ""} ${hideM.includes(i) ? "max-sm:hidden" : ""}`}>{c}</span>)}
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
  // week-to-week LOB comparison: same days as the KPI (like-for-like) unless "Full week lalu" is picked
  const fullPrev = p.q.lw === "full" || !running;
  const cmpEnd = prev ? (fullPrev ? prev.end : prevCut!) : "";
  const lobB = lobBreakdown(B);
  const lobA = prev && cmpEnd >= prev.start ? lobBreakdown(linesOf({ start: prev.start, end: cmpEnd })) : null;
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
  // WhatsApp text: short lines (one figure per line), bold headers, plain "Rp" amounts (no special spaces)
  const share = [
    `*${appConfig().storeName || "Store"}*`,
    `*Weekly Performance W${cur.index} — ${range} ${p.month.slice(0, 4)}*`,
    ...(running ? [`_Week berjalan, data s/d ${dayName(p.asOf)} ${dm(p.asOf)}_`] : []),
    "",
    "*SALES WEEK*",
    `Sales: ${rp(tb.sales)}`,
    `Target: ${rp(target)} (${pct(ach, 0)})`,
    ...(growth == null ? [] : [`vs W${prev!.index}${running ? " (hari yg sama)" : ""}: ${growth >= 0 ? "+" : ""}${pct(growth)}`]),
    "",
    "*PER GRUP*",
    ...GROUPS.map((g) => {
      const t = tgtOf(cur, s.target?.byGroup[g] ?? 0);
      return `• *${g}*: ${rp(tb.byGroup[g])} (${t ? pct((tb.byGroup[g] / t) * 100, 0) : "–"})`;
    }),
    "",
    "*TRANSAKSI*",
    `Invoice ${num(tb.invoices)} · Qty ${num(tb.qty)}`,
    `UPT ${dec(tb.upt, 2)} · ATV ${rp(tb.atv)}`,
    ...(conv.cvr == null ? [] : [`CVR ${pct(conv.cvr)}`]),
    "",
    "*STAFF*",
    ...people.filter((r) => !r.isChannel).map((r, i) => `${i + 1}. ${displayName(r.name)}: ${rp(r.totals.sales)}${r.target ? ` (${pct((r.totals.sales / r.target) * 100, 0)})` : ""}`),
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

      <Panel title="Harian Minggu–Sabtu" desc={`Batang = sales per hari · garis = target harian (${rpc(dailyTarget)}). Biru ≥ target, merah muda < target. Ketuk hari untuk detail.`}>
        <div className="relative flex h-44 items-end gap-1.5 border-b border-slate-200 px-1 pt-5 sm:gap-3 dark:border-slate-700">
          {dailyTarget > 0 && (
            <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-amber-500" style={{ bottom: `${(dailyTarget / peak) * 100}%` }}>
              <span className="absolute -top-4 right-0 bg-white px-1 text-[10px] font-extrabold text-amber-700 max-sm:hidden dark:bg-slate-900">target/hari</span>
            </div>
          )}
          {dayRows.map((r) => (
            <div key={r.date} className="relative flex h-full flex-1 flex-col items-center justify-end">
              {!r.future && <button type="button" popoverTarget={`day-${r.date}`} className="absolute inset-0 z-10 cursor-pointer" aria-label={`Detail ${dayName(r.date)} ${dm(r.date)}`} />}
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
          cols="4.6rem minmax(7.4rem,1.3fr) repeat(4,minmax(4.8rem,1fr)) 2.4rem 2.4rem 3.2rem"
          colsM="minmax(2.4rem,1fr) 4.4rem 1.7rem 1.8rem 2.6rem"
          hideM={[2, 3, 4, 5]}
          head={["Hari", "Sales", ...GROUPS, "Inv", "UPT", "Ach"]}
          rows={dayRows.map((r) => ({
            key: r.date,
            pop: r.future ? undefined : `day-${r.date}`,
            label: `Detail ${dayName(r.date)} ${dm(r.date)}`,
            sub: r.future ? undefined : GROUPS.map((g) => `${g} ${rpc(r.t.byGroup[g])}`).join(" · "),
            cells: [
              <span key="d" className={`leading-tight ${r.future ? "text-slate-400" : "text-blue-600"}`}><b>{DAY_SHORT[new Date(r.date + "T00:00:00Z").getUTCDay()]}</b> <span className="text-[11px]">{Number(r.date.slice(8))}</span>{!r.future && <span className="ml-0.5 text-[11px]">›</span>}</span>,
              r.future ? <span key="s" className="text-slate-400">belum</span> : <b key="s"><span className="sm:hidden">{rpc(r.t.sales)}</span><span className="max-sm:hidden">{rpf(r.t.sales)}</span></b>,
              ...GROUPS.map((g) => (r.future ? "" : <span key={g} className={r.t.byGroup[g] ? "" : "text-slate-400"}>{rpc(r.t.byGroup[g])}</span>)),
              r.future ? "" : num(r.t.invoices),
              r.future ? "" : dec(r.t.upt, 1).replace(",", "."),
              r.future || !dailyTarget ? "" : <span key="a" className={r.t.sales >= dailyTarget ? "font-bold text-emerald-600" : "font-bold text-rose-600"}>{pct((r.t.sales / dailyTarget) * 100, 0)}</span>,
            ],
          }))}
          foot={["Total", <span key="s"><span className="sm:hidden">{rpc(tb.sales)}</span><span className="max-sm:hidden">{rpf(tb.sales)}</span></span>, ...GROUPS.map((g) => rpc(tb.byGroup[g])), num(tb.invoices), dec(tb.upt, 1).replace(",", "."), pct(ach, 0)]}
        />
        {best && best.t.sales > 0 && <p className="mt-2 text-xs text-slate-500">Hari terbaik: <b>{dayName(best.date)} {dm(best.date)} · {rpf(best.t.sales)}</b></p>}
        {dayRows.filter((r) => !r.future).map((r) => (
          <DayDetail key={r.date} date={r.date} year={p.month.slice(0, 4)} lines={byDay.get(r.date) ?? []} target={s.target} dim={dim} href={withQuery("/sales", { m: p.month }, { d: r.date })} />
        ))}
      </Panel>

      <Panel
        title={`Comparison per LOB · W${cur.index} vs ${prev ? `W${prev.index}` : "week lalu"}`}
        desc={prev ? `This week ${span(cur.start, upTo(cur.end))} vs last week ${span(prev.start, cmpEnd)}. Apple per LOB (AirPods termasuk Apple), Android per brand, ACC tanpa AirPods.` : "Week pertama bulan ini — belum ada week sebelumnya di bulan yang sama."}
        right={running && prev ? (
          <div className="flex flex-wrap gap-1.5">
            {[["", "Hari yang sama"], ["full", "Full week lalu"]].map(([v, l]) => (
              <Link key={v} href={withQuery("/week-performance", p.q, { lw: v })} prefetch={false} scroll={false} className={`rounded-full border px-3 py-1 text-xs font-bold ${(v === "full") === fullPrev ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>{l}</Link>
            ))}
          </div>
        ) : undefined}
      >
        <LobCompare b={lobB} a={lobA} wb={`W${cur.index}`} wa={prev ? `W${prev.index}` : "Lalu"} />
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

/** Popup with one day of the week: totals vs the daily target, per group, per staff and the items sold. */
function DayDetail({ date, year, lines, target, dim, href }: { date: string; year: string; lines: SalesLine[]; target: StoreTarget | null; dim: number; href: string }) {
  const id = `day-${date}`;
  const t = totals(lines);
  const tgt = (target?.total ?? 0) / dim;
  const a = tgt ? (t.sales / tgt) * 100 : null;
  const { staff, channels } = byStaff(lines, target, 1 / dim);
  const people = [...staff, ...channels].filter((r) => r.totals.lines).sort((x, y) => y.totals.sales - x.totals.sales);
  const prod = new Map<string, { type: string; qty: number; value: number }>();
  for (const l of lines) {
    if (!l.countsInQty || !(l.group === "Apple" || l.group === "Android" || l.lob === "AirPods")) continue;
    const k = productType(l);
    const e = prod.get(k) ?? { type: k, qty: 0, value: 0 };
    e.qty += l.qty;
    e.value += l.amount;
    prod.set(k, e);
  }
  const top = [...prod.values()].sort((x, y) => y.qty - x.qty || y.value - x.value).slice(0, 8);
  const H = ({ children }: { children: ReactNode }) => <p className="mt-4 mb-1.5 text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">{children}</p>;
  return (
    <div id={id} popover="auto" className="m-auto max-h-[90dvh] w-[min(94vw,560px)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl backdrop:bg-slate-900/40 sm:p-5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-black">{dayName(date)}, {dm(date)} {year}</p>
          <p className="text-xs text-slate-500">Target harian {tgt ? rpf(tgt) : "—"}</p>
        </div>
        <button type="button" popoverTarget={id} popoverTargetAction="hide" className="sd-btn" aria-label="Tutup">✕</button>
      </div>

      <div className="mt-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <div className="flex items-end justify-between gap-3">
          <p className="text-xl font-black tabular-nums">{rpf(t.sales)}</p>
          {a != null && <p className={`text-lg font-black ${t.sales >= tgt ? "text-emerald-600" : "text-rose-600"}`}>{pct(a, 0)}</p>}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center tabular-nums">
          {[["Invoice", num(t.invoices)], ["Qty", num(t.qty)], ["UPT", dec(t.upt, 2).replace(",", ".")], ["ATV", rpc(t.atv)]].map(([k, v]) => (
            <div key={k}><p className="text-[10.5px] font-bold text-slate-500 uppercase">{k}</p><p className="text-[13px] font-black">{v}</p></div>
          ))}
        </div>
      </div>

      <H>Per Grup</H>
      <div className="overflow-hidden rounded-xl border border-slate-200 text-[13px] dark:border-slate-700">
        {GROUPS.map((g) => {
          const gt = (target?.byGroup[g] ?? 0) / dim;
          return (
            <div key={g} className="grid grid-cols-[minmax(0,1fr)_auto_2.8rem] items-center gap-x-2 border-t border-slate-200 px-3 py-1.5 tabular-nums first:border-t-0 dark:border-slate-700">
              <b>{g}</b>
              <span className="text-right">{rpc(t.byGroup[g])} <span className="text-[11px] text-slate-400">/ {gt ? rpc(gt) : "–"}</span></span>
              <b className={`text-right ${gt && t.byGroup[g] >= gt ? "text-emerald-600" : "text-rose-600"}`}>{gt ? pct((t.byGroup[g] / gt) * 100, 0) : "–"}</b>
            </div>
          );
        })}
      </div>

      <H>Staff</H>
      {people.length ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 text-[13px] dark:border-slate-700">
          {people.map((r) => (
            <div key={r.key} className="border-t border-slate-200 px-3 py-1.5 first:border-t-0 dark:border-slate-700">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_2.8rem] items-center gap-x-2 tabular-nums">
                <b className="min-w-0 truncate">{displayName(r.name)}{r.isChannel && <span className="ml-1 text-[10px] font-semibold text-slate-400">online</span>}</b>
                <span className="text-right font-bold">{rpc(r.totals.sales)}</span>
                <span className={`text-right text-[12px] font-bold ${r.target ? (r.totals.sales >= r.target ? "text-emerald-600" : "text-rose-600") : "text-slate-400"}`}>{r.target ? pct((r.totals.sales / r.target) * 100, 0) : "–"}</span>
              </div>
              <p className="text-[11px] text-slate-500">{num(r.totals.invoices)} trx · {num(r.totals.qty)} unit{r.target ? ` · target ${rpc(r.target)}` : ""}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Belum ada penjualan.</p>
      )}

      {top.length > 0 && (
        <>
          <H>Produk terjual</H>
          <div className="overflow-hidden rounded-xl border border-slate-200 text-[13px] dark:border-slate-700">
            {top.map((x) => (
              <div key={x.type} className="grid grid-cols-[minmax(0,1fr)_2rem_4.4rem] items-center gap-x-2 border-t border-slate-200 px-3 py-1.5 tabular-nums first:border-t-0 dark:border-slate-700">
                <span className="min-w-0 break-words">{x.type}</span>
                <b className="text-right">{num(x.qty)}</b>
                <span className="text-right text-slate-500">{rpc(x.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <Link href={href} prefetch={false} className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline">Buka di Daily Sales ›</Link>
    </div>
  );
}

const APPLE_ROWS: Array<[string, string]> = [["iPhone", "iPhone"], ["iPad", "iPad"], ["Mac", "MacBook"], ["Apple Watch", "Apple Watch"], ["AirPods", "AirPods"]];
const ANDROID_ORDER = ["Samsung", "Oppo", "Xiaomi", "Infinix", "Motorola", "Amazfit", "Huawei", "Vivo", "Realme", "Tecno", "Honor"];

/** "Weekly Dashboard" table: qty and value this week vs last week, difference and % — Apple per LOB, Android per brand, ACC, VAS. */
function LobCompare({ b, a, wb, wa }: { b: ReturnType<typeof lobBreakdown>; a: ReturnType<typeof lobBreakdown> | null; wb: string; wa: string }) {
  const z: QV = { qty: 0, value: 0 };
  const sum = (xs: QV[]): QV => xs.reduce((t, x) => ({ qty: t.qty + x.qty, value: t.value + x.value }), { qty: 0, value: 0 });
  const appleKeys = [...APPLE_ROWS.map(([k]) => k), ...new Set([...Object.keys(b.apple), ...Object.keys(a?.apple ?? {})].filter((k) => !APPLE_ROWS.some(([x]) => x === k)))];
  const brands = [...new Set([...Object.keys(b.android), ...Object.keys(a?.android ?? {})])].sort((x, y) => {
    const ix = ANDROID_ORDER.indexOf(x), iy = ANDROID_ORDER.indexOf(y);
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x.localeCompare(y);
  });
  type R = { key: string; label: string; cur: QV; last: QV | null; tone?: "total" | "grand" };
  const appleCur = appleKeys.map((k) => b.apple[k] ?? z);
  const appleLast = a ? appleKeys.map((k) => a.apple[k] ?? z) : null;
  const andCur = brands.map((k) => b.android[k] ?? z);
  const andLast = a ? brands.map((k) => a.android[k] ?? z) : null;
  const rows: R[] = [
    ...appleKeys.map((k, i) => ({ key: `a-${k}`, label: APPLE_ROWS.find(([x]) => x === k)?.[1] ?? k, cur: appleCur[i], last: appleLast?.[i] ?? null })),
    { key: "ta", label: "Total Apple", cur: sum(appleCur), last: appleLast && sum(appleLast), tone: "total" },
    ...brands.map((k, i) => ({ key: `b-${k}`, label: k, cur: andCur[i], last: andLast?.[i] ?? null })),
    { key: "tn", label: "Total Android", cur: sum(andCur), last: andLast && sum(andLast), tone: "total" },
    { key: "acc", label: "Total ACC", cur: b.acc, last: a?.acc ?? null, tone: "total" },
    { key: "vas", label: "Total VAS", cur: b.vas, last: a?.vas ?? null, tone: "total" },
  ];
  const grand = { cur: sum([sum(appleCur), sum(andCur), b.acc, b.vas]), last: a && andLast && appleLast ? sum([sum(appleLast), sum(andLast), a.acc, a.vas]) : null };
  rows.push({ key: "g", label: "Grand Total", cur: grand.cur, last: grand.last, tone: "grand" });

  const g = (x: number, y: number | undefined) => (y == null ? null : y ? ((x - y) / y) * 100 : x ? null : 0);
  const pctCell = (v: number | null) => (v == null ? <span className="text-slate-400">–</span> : <span className={`rounded px-1 font-bold ${v < 0 ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10" : v > 0 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" : "text-slate-500"}`}>{v > 0 ? "+" : ""}{pct(v, 0)}</span>);
  const diff = (v: number | null, isMoney: boolean) => (v == null ? "–" : <span className={v < 0 ? "text-rose-600" : v > 0 ? "text-emerald-600" : "text-slate-400"}>{isMoney ? money(v, true) : `${v > 0 ? "+" : ""}${num(v)}`}</span>);
  // money: compact on phones / tablets, full rupiah on wide screens (like the sheet)
  const money = (n: number, sign = false) => <><span className="xl:hidden">{sign && n > 0 ? "+" : ""}{rpc(n)}</span><span className="max-xl:hidden">{sign && n > 0 ? "+" : ""}{rpf(n)}</span></>;
  const dash = (n: number, isMoney: boolean) => (n ? (isMoney ? money(n) : num(n)) : <span className="text-slate-400">–</span>);

  return (
    <>
      <div className="sm:overflow-x-auto"><div className="sm:min-w-[36rem]">
      <Grid
        cols="minmax(5.4rem,1.1fr) 2.6rem 2.6rem 2.6rem 3.3rem minmax(4.6rem,1fr) minmax(4.6rem,1fr) minmax(4.6rem,1fr) 3.4rem"
        colsM="minmax(3.4rem,1fr) 4.3rem 4.3rem 2.9rem"
        hideM={[1, 2, 3, 4, 7]}
        head={[
          "LOB / Brand",
          `Qty ${wb}`,
          `Qty ${wa}`,
          "Δ Qty",
          "%",
          <span key="v"><span className="sm:hidden">{wb}</span><span className="max-sm:hidden">Value {wb}</span></span>,
          <span key="l"><span className="sm:hidden">{wa}</span><span className="max-sm:hidden">Value {wa}</span></span>,
          "Δ Value",
          "%",
        ]}
        rows={rows.map((r) => ({
          key: r.key,
          className: r.tone === "grand" ? "bg-slate-100 font-black dark:bg-slate-800" : r.tone === "total" ? "bg-slate-50 font-bold dark:bg-slate-800/60" : "",
          cells: [
            <span key="n" className={r.tone ? "" : "font-semibold"}>{r.label}</span>,
            dash(r.cur.qty, false),
            r.last ? dash(r.last.qty, false) : "–",
            diff(r.last ? r.cur.qty - r.last.qty : null, false),
            pctCell(g(r.cur.qty, r.last?.qty)),
            <b key="v">{dash(r.cur.value, true)}</b>,
            r.last ? dash(r.last.value, true) : "–",
            diff(r.last ? r.cur.value - r.last.value : null, true),
            pctCell(g(r.cur.value, r.last?.value)),
          ],
          sub: r.last ? <>Qty {num(r.cur.qty)} vs {num(r.last.qty)} ({r.cur.qty - r.last.qty > 0 ? "+" : ""}{num(r.cur.qty - r.last.qty)}) · Δ {r.cur.value - r.last.value > 0 ? "+" : ""}{rpc(r.cur.value - r.last.value)}</> : <>Qty {num(r.cur.qty)}</>,
        }))}
      />
      </div></div>
      <p className="mt-2 text-xs text-slate-500">Δ dan % = {wb} dibanding {wa}. Grand Total = Apple + Android + ACC + VAS (sama dengan total sales).</p>
    </>
  );
}
