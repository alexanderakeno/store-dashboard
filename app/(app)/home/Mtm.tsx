import { EmptyBlock, Panel, SectionHead, Trend, achColor } from "@/components/kit";
import { ParamSelect } from "@/components/kit/controls";
import { MobileGrid } from "@/components/kit/MobileGrid";
import { mtmView, type MtmView } from "@/lib/domain/mtm";
import { prevMonth } from "@/lib/domain/period";
import { dateShort, dec, monthLabel, monthShort, num, pct, rpc, rpf } from "@/lib/format";
import { getMonthSnapshot, type MonthSnapshot } from "@/lib/services/dashboard";
import type { MonthEntry } from "@/lib/repositories";

const LOB_LABEL: Record<string, string> = { iPhone: "iPhone", Mac: "MacBook", iPad: "iPad", "Apple Watch": "Apple Watch", AirPods: "AirPods" };
const muted = <span className="text-slate-400">—</span>;
const upt = (n: number | null) => dec(n, 1).replace(",", ".");

/** Month-to-month overview: selected month vs another month, same day range. */
export async function Mtm({ snap, asOf, months, q }: { snap: MonthSnapshot; asOf: string; months: MonthEntry[]; q: Record<string, string> }) {
  const others = months.filter((m) => m.month !== snap.month).sort((a, b) => b.month.localeCompare(a.month));
  const fallback = others.find((m) => m.month === prevMonth(snap.month))?.month ?? others.find((m) => m.month < snap.month)?.month ?? others[0]?.month;
  const vs = q.vs && others.some((m) => m.month === q.vs) ? q.vs : fallback;

  const picker = (
    <section className="sd-panel p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <ParamSelect param="m" label="Bulan" value={snap.month} reset={["d"]} options={months.map((m) => ({ value: m.month, label: monthLabel(m.month) }))} />
        <ParamSelect param="vs" label="Dibanding" value={vs ?? ""} options={vs ? others.map((m) => ({ value: m.month, label: monthLabel(m.month) })) : [{ value: "", label: "Belum ada bulan lain" }]} />
        <div className="self-end text-right sm:col-span-1">
          <p className="text-sm font-bold text-slate-500">Periode sama</p>
          <p className="text-xs text-slate-400">Tanggal 1–{Number(asOf.slice(8))} di kedua bulan</p>
        </div>
      </div>
    </section>
  );

  if (!vs) {
    return (
      <>
        {picker}
        <EmptyBlock title="Bulan pembanding">Daftarkan minimal satu bulan lain di Settings untuk membandingkan month-to-month.</EmptyBlock>
      </>
    );
  }

  let other: MonthSnapshot;
  try {
    other = await getMonthSnapshot(vs);
  } catch (e) {
    return (
      <>
        {picker}
        <EmptyBlock title={`Data ${monthLabel(vs)}`}>{(e as Error).message}</EmptyBlock>
      </>
    );
  }

  const v = mtmView(snap, asOf, other);
  return (
    <>
      {picker}
      <Summary v={v} />
      <Kpis v={v} />
      <Groups v={v} />
      <Lob v={v} />
      <Full v={v} />
      <Staff v={v} />
    </>
  );
}

function Summary({ v }: { v: MtmView }) {
  const a = monthShort(v.base.month);
  const b = monthShort(v.compare.month);
  const g = v.growth;
  const best = v.compare.bestDay;
  const exBest = best ? v.compare.totals.sales - best.sales : 0;
  const exGrowth = best && exBest ? ((v.base.totals.sales - exBest) / exBest) * 100 : null;
  const spike = best && v.compare.totals.sales ? best.sales / v.compare.totals.sales >= 0.2 : false;
  const driver = g.sales == null ? null : Math.abs(g.invoices ?? 0) < Math.abs(g.atv ?? 0) ? "nilai per transaksi (ATV)" : "jumlah transaksi";
  return (
    <section className="sd-panel p-5 sm:p-6">
      <p className="sd-label">Ringkasan</p>
      <p className="mt-1 text-base leading-relaxed text-slate-700 sm:text-lg">
        Sales {a} tanggal 1–{v.day} <Trend value={g.sales} digits={1} /> dibanding {b} di periode yang sama ({rpf(v.base.totals.sales)} vs {rpf(v.compare.totals.sales)}).
        {driver && <> Transaksi <Trend value={g.invoices} digits={1} />, ATV <Trend value={g.atv} digits={1} /> — perubahan terbesar datang dari {driver}.</>}
        {spike && best && exGrowth != null && (
          <> Hari terbaik {b} ({dateShort(best.date)}, {rpf(best.sales)}) menyumbang {pct((best.sales / v.compare.totals.sales) * 100, 0)}; tanpa hari itu, {a} <Trend value={exGrowth} digits={1} />.</>
        )}
      </p>
    </section>
  );
}

function Kpis({ v }: { v: MtmView }) {
  const b = monthShort(v.compare.month);
  const items = [
    { label: "Total Sales", cur: rpf(v.base.totals.sales), prev: rpf(v.compare.totals.sales), g: v.growth.sales, tone: "blue" },
    { label: "Ach vs Target Prorata", cur: pct(v.base.achievementPct, 0), prev: pct(v.compare.achievementPct, 0), g: null, tone: "violet", sub: `Target ${rpf(v.base.targetProrated)}` },
    { label: "Transaksi", cur: num(v.base.totals.invoices), prev: num(v.compare.totals.invoices), g: v.growth.invoices, tone: "green" },
    { label: "Qty", cur: num(v.base.totals.qty), prev: num(v.compare.totals.qty), g: v.growth.qty, tone: "green" },
    { label: "UPT", cur: upt(v.base.totals.upt), prev: upt(v.compare.totals.upt), g: v.growth.upt, tone: "amber" },
    { label: "ATV", cur: rpf(v.base.totals.atv), prev: rpf(v.compare.totals.atv), g: v.growth.atv, tone: "amber" },
  ];
  return (
    <div className="space-y-4">
      <SectionHead title={`${monthShort(v.base.month)} vs ${b}`} desc={`Tanggal 1–${v.day}. Angka besar = ${monthShort(v.base.month)}, di bawahnya ${b}.`} />
      {/* phone: the two money cards full width, the four small KPIs two per row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        {items.map((it, i) => (
          <article key={it.label} className={`sd-block-card p-4 sm:p-5 ${i < 2 ? "col-span-2 sm:col-span-1" : ""}`} data-tone={it.tone}>
            <p className="text-[11px] font-black tracking-[.08em] text-slate-500 uppercase sm:text-xs">{it.label}</p>
            <p className={`mt-2 font-black tracking-tight text-slate-950 ${i < 2 ? "text-2xl" : it.cur.length > 8 ? "sd-num sm:!text-2xl" : "text-xl sm:text-2xl"}`}>{it.cur}</p>
            <div className="mt-3 flex flex-wrap justify-between gap-x-2 gap-y-1 border-t border-slate-200 pt-3 text-[12px] sm:text-[13px] dark:border-slate-700">
              <span className="text-slate-500">{b} {it.prev}</span>
              {it.g !== null ? <Trend value={it.g} digits={1} /> : it.sub && <span className="text-slate-500">{it.sub}</span>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Groups({ v }: { v: MtmView }) {
  const a = monthShort(v.base.month);
  const b = monthShort(v.compare.month);
  return (
    <Panel title="Per Grup" desc={`Sales tanggal 1–${v.day}; Ach = actual ÷ target prorata ${v.day} hari.`}>
      <MobileGrid
        cols={[{ label: "Grup" }, { label: b, w: "4.5rem" }, { label: a, w: "4.5rem" }, { label: "Growth", w: "3.7rem" }]}
        rows={v.groups.map((g) => ({
          key: g.group,
          cells: [<b key="g">{g.group}</b>, rpc(g.compare), <b key="a">{rpc(g.base)}</b>, <Trend key="t" value={g.growthPct} digits={1} />],
          sub: <>Selisih <b className={g.diff >= 0 ? "text-emerald-600" : "text-rose-600"}>{rpc(g.diff)}</b> · Ach {b} <b style={{ color: achColor(g.compareAch, 100) }}>{pct(g.compareAch, 0)}</b> · Ach {a} <b style={{ color: achColor(g.baseAch, 100) }}>{pct(g.baseAch, 0)}</b></>,
        }))}
        foot={["Total", rpc(v.compare.totals.sales), rpc(v.base.totals.sales), <Trend key="t" value={v.growth.sales} digits={1} />]}
      />
      <div className="sd-table-wrap max-sm:hidden">
        <table className="sd-table">
          <thead>
            <tr><th>Grup</th><th className="n">{b}</th><th className="n">{a}</th><th className="n">Selisih</th><th className="n">Growth</th><th className="n">Ach {b}</th><th className="n">Ach {a}</th></tr>
          </thead>
          <tbody>
            {v.groups.map((g) => (
              <tr key={g.group}>
                <td className="font-bold">{g.group}</td>
                <td className="n">{rpf(g.compare)}</td>
                <td className="n">{rpf(g.base)}</td>
                <td className={`n font-semibold ${g.diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{rpf(g.diff)}</td>
                <td className="n"><Trend value={g.growthPct} digits={1} /></td>
                <td className="n" style={{ color: achColor(g.compareAch, 100) }}>{pct(g.compareAch, 0)}</td>
                <td className="n" style={{ color: achColor(g.baseAch, 100) }}>{pct(g.baseAch, 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="n">{rpf(v.compare.totals.sales)}</td>
              <td className="n">{rpf(v.base.totals.sales)}</td>
              <td className="n">{rpf(v.base.totals.sales - v.compare.totals.sales)}</td>
              <td className="n"><Trend value={v.growth.sales} digits={1} /></td>
              <td className="n">{pct(v.compare.achievementPct, 0)}</td>
              <td className="n">{pct(v.base.achievementPct, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}

function Lob({ v }: { v: MtmView }) {
  const a = monthShort(v.base.month);
  const b = monthShort(v.compare.month);
  const max = Math.max(1, ...v.lob.flatMap((r) => [r.baseQty, r.compareQty]));
  return (
    <Panel title="LOB Apple" desc={`Qty dan value tanggal 1–${v.day}. Bar abu-abu = ${b}, biru = ${a}.`}>
      <MobileGrid
        cols={[{ label: "LOB" }, { label: `Qty ${b}`, w: "3.2rem" }, { label: `Qty ${a}`, w: "3.2rem" }, { label: "Growth", w: "3.7rem" }]}
        rows={v.lob.map((r) => ({
          key: r.lob,
          cells: [<b key="l">{LOB_LABEL[r.lob]}</b>, num(r.compareQty), <b key="a">{num(r.baseQty)}</b>, <Trend key="t" value={r.qtyGrowth} digits={1} />],
          sub: <>Value {rpc(r.compareValue)} → <b>{rpc(r.baseValue)}</b> · <Trend value={r.valueGrowth} digits={1} /></>,
        }))}
      />
      <div className="sd-table-wrap max-sm:hidden">
        <table className="sd-table">
          <thead>
            <tr><th>LOB</th><th style={{ minWidth: 160 }}>Qty</th><th className="n">{b}</th><th className="n">{a}</th><th className="n">Growth Qty</th><th className="n">Value {b}</th><th className="n">Value {a}</th><th className="n">Growth Value</th></tr>
          </thead>
          <tbody>
            {v.lob.map((r) => (
              <tr key={r.lob}>
                <td className="font-bold">{LOB_LABEL[r.lob]}</td>
                <td>
                  <div className="space-y-1" aria-hidden>
                    <div className="h-2 rounded-full bg-slate-300 dark:bg-slate-600" style={{ width: `${(r.compareQty / max) * 100}%` }} />
                    <div className="h-2 rounded-full bg-blue-600" style={{ width: `${(r.baseQty / max) * 100}%` }} />
                  </div>
                </td>
                <td className="n">{num(r.compareQty)}</td>
                <td className="n">{num(r.baseQty)}</td>
                <td className="n"><Trend value={r.qtyGrowth} digits={1} /></td>
                <td className="n">{rpf(r.compareValue)}</td>
                <td className="n">{rpf(r.baseValue)}</td>
                <td className="n"><Trend value={r.valueGrowth} digits={1} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Full({ v }: { v: MtmView }) {
  const a = monthShort(v.base.month);
  const b = monthShort(v.compare.month);
  return (
    <Panel
      title="Bulan Penuh"
      desc={`${b} ${v.compareClosed ? "bulan penuh" : "s/d data terakhir"} vs estimasi closing ${a} (MTD ÷ hari berjalan × hari dalam bulan).`}
      right={!v.compareClosed ? <span className="sd-badge amber">{b} belum tutup bulan</span> : undefined}
    >
      <MobileGrid
        cols={[{ label: "Grup" }, { label: `${b} Act`, w: "4.5rem" }, { label: `${a} Est`, w: "4.5rem" }, { label: "vs", w: "3.7rem" }]}
        rows={v.full.map((r) => ({
          key: r.group,
          className: r.group === "Total" ? "bg-slate-50 font-black dark:bg-slate-800/60" : "",
          cells: [<b key="g">{r.group}</b>, rpc(r.compareActual), <b key="a">{rpc(r.baseEstimate)}</b>, <Trend key="t" value={r.growthPct} digits={1} />],
          sub: <>Ach {b} <b style={{ color: achColor(r.compareAch, 100) }}>{pct(r.compareAch, 0)}</b> dari {rpc(r.compareTarget)} · Est. ach {a} <b style={{ color: achColor(r.baseEstAch, 100) }}>{pct(r.baseEstAch, 0)}</b> dari {rpc(r.baseTarget)}</>,
        }))}
      />
      <div className="sd-table-wrap max-sm:hidden">
        <table className="sd-table">
          <thead>
            <tr><th>Grup</th><th className="n">{b} Actual</th><th className="n">{b} Target</th><th className="n">Ach</th><th className="n">{a} Est. Closing</th><th className="n">{a} Target</th><th className="n">Est. Ach</th><th className="n">Est. vs {b}</th></tr>
          </thead>
          <tbody>
            {v.full.filter((r) => r.group !== "Total").map((r) => (
              <tr key={r.group}>
                <td className="font-bold">{r.group}</td>
                <td className="n">{rpf(r.compareActual)}</td>
                <td className="n">{rpf(r.compareTarget)}</td>
                <td className="n font-semibold" style={{ color: achColor(r.compareAch, 100) }}>{pct(r.compareAch, 0)}</td>
                <td className="n">{rpf(r.baseEstimate)}</td>
                <td className="n">{rpf(r.baseTarget)}</td>
                <td className="n font-semibold" style={{ color: achColor(r.baseEstAch, 100) }}>{pct(r.baseEstAch, 0)}</td>
                <td className="n"><Trend value={r.growthPct} digits={1} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {v.full.filter((r) => r.group === "Total").map((r) => (
              <tr key="total">
                <td>Total</td>
                <td className="n">{rpf(r.compareActual)}</td>
                <td className="n">{rpf(r.compareTarget)}</td>
                <td className="n">{pct(r.compareAch, 0)}</td>
                <td className="n">{rpf(r.baseEstimate)}</td>
                <td className="n">{rpf(r.baseTarget)}</td>
                <td className="n">{pct(r.baseEstAch, 0)}</td>
                <td className="n"><Trend value={r.growthPct} digits={1} /></td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}

function Staff({ v }: { v: MtmView }) {
  const a = monthShort(v.base.month);
  const b = monthShort(v.compare.month);
  return (
    <Panel title="Staff" desc={`Sales per staff tanggal 1–${v.day} di kedua bulan.`}>
      <MobileGrid
        cols={[{ label: "Staff" }, { label: b, w: "4.5rem" }, { label: a, w: "4.5rem" }, { label: "Growth", w: "3.7rem" }]}
        rows={v.staff.map((x) => ({
          key: x.key,
          cells: [<b key="n" className="leading-tight">{x.name}{x.isChannel && <span className="ml-1 text-[10px] font-semibold text-slate-400">online</span>}</b>, x.compare ? rpc(x.compare.sales) : muted, <b key="a">{x.base ? rpc(x.base.sales) : muted}</b>, x.base && x.compare ? <Trend key="t" value={x.growthPct} digits={1} /> : <span key="t" className="text-[11px] text-slate-400">{x.base ? "baru" : "–"}</span>],
          sub: <>Trx {x.compare ? num(x.compare.invoices) : "–"} → {x.base ? num(x.base.invoices) : "–"} · ATV {x.compare ? rpc(x.compare.atv) : "–"} → {x.base ? rpc(x.base.atv) : "–"}</>,
        }))}
        empty="Belum ada transaksi."
      />
      <div className="sd-table-wrap max-sm:hidden">
        <table className="sd-table">
          <thead>
            <tr><th>Staff</th><th className="n">Sales {b}</th><th className="n">Sales {a}</th><th className="n">Growth</th><th className="n">Trx {b}</th><th className="n">Trx {a}</th><th className="n">ATV {b}</th><th className="n">ATV {a}</th></tr>
          </thead>
          <tbody>
            {v.staff.map((s) => (
              <tr key={s.key}>
                <td className="font-bold text-slate-950">{s.name}{s.isChannel && <span className="ml-2 text-xs font-semibold text-slate-400">online</span>}</td>
                <td className="n">{s.compare ? rpf(s.compare.sales) : muted}</td>
                <td className="n">{s.base ? rpf(s.base.sales) : muted}</td>
                <td className="n">{s.base && s.compare ? <Trend value={s.growthPct} digits={1} /> : <span className="text-xs text-slate-400">{s.base ? "baru" : "tidak ada"}</span>}</td>
                <td className="n">{s.compare ? num(s.compare.invoices) : muted}</td>
                <td className="n">{s.base ? num(s.base.invoices) : muted}</td>
                <td className="n">{s.compare ? rpf(s.compare.atv) : muted}</td>
                <td className="n">{s.base ? rpf(s.base.atv) : muted}</td>
              </tr>
            ))}
            {!v.staff.length && <tr><td colSpan={8} className="text-slate-500">Belum ada transaksi.</td></tr>}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
