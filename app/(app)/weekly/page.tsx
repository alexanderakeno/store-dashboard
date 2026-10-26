import { NeedData, PageIntro, Panel, Progress, Trend, achColor } from "@/components/kit";
import { ParamSelect, PrintButton } from "@/components/kit/controls";
import { MobileGrid, type MobileRow } from "@/components/kit/MobileGrid";
import { PageStatus } from "@/components/layout/PageStatus";
import { APPLE_LOBS, VAS_PROVIDERS, deviceOf, typeQty, vasSplit } from "@/lib/domain/extra";
import { totals } from "@/lib/domain/kpi";
import { addDays, daysInMonth, eachDay, weeksOfMonth } from "@/lib/domain/period";
import { dateShort, num, pct, rpc, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { GROUPS, type SalesLine } from "@/types/domain";

const LOB_LABEL: Record<string, string> = { iPhone: "iPhone", Mac: "MacBook", iPad: "iPad", "Apple Watch": "Watch", AirPods: "AirPods" };

export default async function WeeklyReportPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Weekly Report" p={p} />;
  const s = p.snap;
  const weeks = weeksOfMonth(p.month).filter((w) => w.start <= p.asOf);
  const cur = weeks.find((w) => String(w.index) === p.q.b) ?? weeks[weeks.length - 1];
  const prevDefault = weeks.find((w) => w.index === cur.index - 1);
  const prev = weeks.find((w) => String(w.index) === p.q.a) ?? prevDefault ?? null;
  const linesOf = (w: { start: string; end: string } | null) => (w ? s.lines.filter((l) => l.date >= w.start && l.date <= w.end && l.date <= p.asOf) : []);
  // while the compared week is still running, the earlier week is cut to the same weekday (like-for-like)
  const running = cur.end > p.asOf && !!prev && prev.index < cur.index;
  const aEnd = prev ? (running ? addDays(prev.end, -(6 - new Date(`${p.asOf}T00:00:00Z`).getUTCDay())) : prev.end) : "";
  const A = prev && aEnd >= prev.start ? linesOf({ start: prev.start, end: aEnd }) : [];
  const B = linesOf(cur);
  const ta = totals(A);
  const tb = totals(B);
  const g = (a: number, b: number) => (a ? ((b - a) / a) * 100 : null);
  const opts = weeks.map((w) => ({ value: String(w.index), label: `${w.label} · ${dateShort(w.start)}–${dateShort(w.end)}` }));
  const qtyOf = (ls: SalesLine[], f: (l: SalesLine) => boolean) => ls.filter((l) => f(l) && l.countsInQty).reduce((a, l) => a + l.qty, 0);
  const amtOf = (ls: SalesLine[], f: (l: SalesLine) => boolean) => ls.filter(f).reduce((a, l) => a + l.amount, 0);
  const cats: Array<[string, (l: SalesLine) => boolean]> = [
    ["Device", (l) => l.group === "Apple" || l.group === "Android"],
    ["VAS", (l) => l.group === "VAS"],
    ["ACC", (l) => l.group === "ACC"],
  ];
  const va = vasSplit(A);
  const vb = vasSplit(B);
  const typesA = typeQty(A);
  const typesB = typeQty(B);
  const dim = daysInMonth(p.month);
  const curDays = eachDay(cur.start, cur.end).length;
  const elapsed = eachDay(cur.start, cur.end < p.asOf ? cur.end : p.asOf).length;
  const tgWeek = (elapsed / curDays) * 100;
  const need = !prev;

  const Row = ({ label, qa, aa, qb, ab, bold }: { label: React.ReactNode; qa: number; aa: number; qb: number; ab: number; bold?: boolean }) => (
    <tr className={bold ? "font-black" : ""}>
      <td className={bold ? "" : "font-bold"}>{label}</td>
      <td className="n">{need ? "—" : num(qa)}</td><td className="n">{need ? "—" : rpf(aa)}</td>
      <td className="n">{num(qb)}</td><td className="n">{rpf(ab)}</td>
      <td className="n">{need ? "—" : <Trend value={g(qa, qb)} digits={0} />}</td><td className="n">{need ? "—" : <Trend value={g(aa, ab)} digits={0} />}</td>
    </tr>
  );
  // phones: one grid per table — W-prev and W-cur as "qty / value", then the value growth
  const wcols = [{ label: "" }, { label: `W${prev?.index ?? "-"}`, w: "4.2rem" }, { label: `W${cur.index}`, w: "4.2rem" }, { label: "Δ Value", w: "3.2rem" }];
  const qv = (q: number, v: number, dim = false) => (
    <span className="leading-tight"><b className={`block ${dim ? "text-slate-400" : ""}`}>{num(q)}</b><span className="text-[10.5px] text-slate-500">{rpc(v)}</span></span>
  );
  const mrow = (key: string, label: React.ReactNode, qa: number, aa: number, qb: number, ab: number, extra: Partial<MobileRow> = {}): MobileRow => ({
    key,
    cells: [label, need ? "—" : qv(qa, aa), qv(qb, ab), need ? "—" : <Trend key="t" value={g(aa, ab)} digits={0} />],
    sub: need ? undefined : <>Qty {g(qa, qb) == null ? "—" : `${(g(qa, qb) ?? 0) >= 0 ? "+" : ""}${Math.round(g(qa, qb) ?? 0)}%`}</>,
    ...extra,
  });
  const Head = ({ first, extra }: { first: string; extra?: string }) => (
    <thead><tr><th>{first}</th>{extra && <th>{extra}</th>}<th className="n">W{prev?.index ?? "-"} Qty</th><th className="n">W{prev?.index ?? "-"} Amount</th><th className="n">W{cur.index} Qty</th><th className="n">W{cur.index} Amount</th><th className="n">Qty %</th><th className="n">Amount %</th></tr></thead>
  );

  return (
    <div className="sd-content">
      <PageIntro title="Weekly Report" desc="Default mengikuti dua week terbaru, tetapi histori week tetap dapat dipilih." actions={<PrintButton label="Unduh" />} />
      <section className="sd-panel grid items-end gap-3 p-5 sm:grid-cols-[1fr_auto_1fr]">
        <ParamSelect param="a" label="Week Sebelumnya" value={prev ? String(prev.index) : ""} options={[...(prev ? [] : [{ value: "", label: "— (bulan sebelumnya)" }]), ...opts]} />
        <span className="pb-2.5 text-center text-sm font-black text-slate-400">VS</span>
        <ParamSelect param="b" label="Week Pembanding" value={String(cur.index)} options={opts} />
        <p className="text-xs text-slate-500 sm:col-span-3">Periode Minggu–Sabtu: {prev ? `${dateShort(prev.start)} s.d. ${dateShort(aEnd < prev.start ? prev.start : aEnd)}` : "—"} vs {dateShort(cur.start)} s.d. {dateShort(cur.end < p.asOf ? cur.end : p.asOf)} <span className="sd-badge blue ml-1">AUTO</span>{running && <span className="mt-1 block">W{cur.index} masih berjalan — W{prev!.index} dihitung sampai hari yang sama agar perbandingannya adil.</span>}</p>
        {need && <p className="text-xs text-amber-700 sm:col-span-3">Week sebelumnya ada di bulan lalu — pilih week lain atau daftarkan bulan sebelumnya. <NeedData /></p>}
      </section>

      <Panel title="Sales Summary — Device / VAS / ACC">
        <MobileGrid
          cols={[{ ...wcols[0], label: "Category" }, ...wcols.slice(1)]}
          rows={[...cats.map(([k, f]) => mrow(k, <b key="l">{k}</b>, qtyOf(A, f), amtOf(A, f), qtyOf(B, f), amtOf(B, f))), mrow("total", <b key="l">TOTAL</b>, ta.qty, ta.sales, tb.qty, tb.sales, { className: "bg-slate-50 font-black dark:bg-slate-800/50" })]}
        />
        <p className="mt-1.5 text-[11px] text-slate-500 sm:hidden">Angka atas = qty, bawah = value.</p>
        <div className="sd-table-wrap max-sm:hidden"><table className="sd-table"><Head first="Category" />
          <tbody>{cats.map(([k, f]) => <Row key={k} label={k} qa={qtyOf(A, f)} aa={amtOf(A, f)} qb={qtyOf(B, f)} ab={amtOf(B, f)} />)}</tbody>
          <tfoot><Row label="TOTAL" qa={ta.qty} aa={ta.sales} qb={tb.qty} ab={tb.sales} bold /></tfoot>
        </table></div>
      </Panel>

      <Panel title="VAS — Qoala / Indosat / Telkomsel / XL">
        <MobileGrid
          cols={[{ ...wcols[0], label: "Provider" }, ...wcols.slice(1)]}
          rows={[
            ...VAS_PROVIDERS.map((v) => mrow(v, <b key="l">{v}</b>, va[v].qty, va[v].value, vb[v].qty, vb[v].value)),
            mrow("total", <b key="l">VAS TOTAL</b>, VAS_PROVIDERS.reduce((a, v) => a + va[v].qty, 0), ta.byGroup.VAS, VAS_PROVIDERS.reduce((a, v) => a + vb[v].qty, 0), tb.byGroup.VAS, { className: "bg-slate-50 font-black dark:bg-slate-800/50" }),
          ]}
        />
        <div className="sd-table-wrap max-sm:hidden"><table className="sd-table"><Head first="Category" />
          <tbody>{VAS_PROVIDERS.map((v) => <Row key={v} label={v} qa={va[v].qty} aa={va[v].value} qb={vb[v].qty} ab={vb[v].value} />)}</tbody>
          <tfoot><Row label="VAS TOTAL" qa={VAS_PROVIDERS.reduce((a, v) => a + va[v].qty, 0)} aa={ta.byGroup.VAS} qb={VAS_PROVIDERS.reduce((a, v) => a + vb[v].qty, 0)} ab={tb.byGroup.VAS} bold /></tfoot>
        </table></div>
      </Panel>

      <Panel title="Weekly LOB" desc="Per type: week sebelumnya vs week pembanding.">
        <MobileGrid
          cols={[{ ...wcols[0], label: "Type" }, ...wcols.slice(1)]}
          rows={APPLE_LOBS.flatMap((lob) => {
            const names = [...new Set([...typesA, ...typesB].filter((x) => x.lob === lob).map((x) => x.type))];
            const f = (arr: typeof typesA, t: string) => arr.find((x) => x.type === t);
            const sum = (arr: typeof typesA, k: "qty" | "value") => arr.filter((x) => x.lob === lob).reduce((a, x) => a + x[k], 0);
            return [
              ...names.map((t) => mrow(`${lob}|${t}`, <span key="l" className="leading-tight"><span className="block text-[10.5px] text-slate-400">{LOB_LABEL[lob]}</span><b>{t}</b></span>, f(typesA, t)?.qty ?? 0, f(typesA, t)?.value ?? 0, f(typesB, t)?.qty ?? 0, f(typesB, t)?.value ?? 0)),
              mrow(`${lob}|total`, <b key="l">{LOB_LABEL[lob]} Total</b>, sum(typesA, "qty"), sum(typesA, "value"), sum(typesB, "qty"), sum(typesB, "value"), { className: "bg-blue-50/60 font-black dark:bg-blue-950/20" }),
            ];
          })}
        />
        <div className="sd-table-wrap max-sm:hidden"><table className="sd-table"><Head first="Product Category" extra="Type" />
          <tbody>
            {APPLE_LOBS.map((lob) => {
              const names = [...new Set([...typesA, ...typesB].filter((x) => x.lob === lob).map((x) => x.type))];
              const f = (arr: typeof typesA, t: string) => arr.find((x) => x.type === t);
              const sumQ = (arr: typeof typesA) => arr.filter((x) => x.lob === lob).reduce((a, x) => a + x.qty, 0);
              const sumV = (arr: typeof typesA) => arr.filter((x) => x.lob === lob).reduce((a, x) => a + x.value, 0);
              return [
                ...names.map((t) => (
                  <tr key={t}>
                    <td className="text-slate-500">{LOB_LABEL[lob]}</td><td className="font-bold">{t}</td>
                    <td className="n">{need ? "—" : num(f(typesA, t)?.qty ?? 0)}</td><td className="n">{need ? "—" : rpf(f(typesA, t)?.value ?? 0)}</td>
                    <td className="n">{num(f(typesB, t)?.qty ?? 0)}</td><td className="n">{rpf(f(typesB, t)?.value ?? 0)}</td>
                    <td className="n">{need ? "—" : <Trend value={g(f(typesA, t)?.qty ?? 0, f(typesB, t)?.qty ?? 0)} />}</td><td className="n">{need ? "—" : <Trend value={g(f(typesA, t)?.value ?? 0, f(typesB, t)?.value ?? 0)} />}</td>
                  </tr>
                )),
                <tr key={`${lob}-t`} className="bg-blue-50/50 font-black">
                  <td>{LOB_LABEL[lob]} Total</td><td />
                  <td className="n">{need ? "—" : num(sumQ(typesA))}</td><td className="n">{need ? "—" : rpf(sumV(typesA))}</td>
                  <td className="n">{num(sumQ(typesB))}</td><td className="n">{rpf(sumV(typesB))}</td>
                  <td className="n">{need ? "—" : <Trend value={g(sumQ(typesA), sumQ(typesB))} />}</td><td className="n">{need ? "—" : <Trend value={g(sumV(typesA), sumV(typesB))} />}</td>
                </tr>,
              ];
            })}
          </tbody>
        </table></div>
      </Panel>

      <Panel title="Target Weekly per Grup" desc={`Pencapaian W${cur.index} dibanding target mingguan (target bulanan ÷ ${dim} × ${curDays} hari). Time gone week ${pct(tgWeek, 0)}.`}>
        <MobileGrid
          cols={[{ label: "Grup" }, { label: "Target", w: "4.6rem" }, { label: "Actual", w: "4.6rem" }, { label: "Ach", w: "2.6rem" }]}
          rows={[
            ...GROUPS.map((k) => {
              const t = ((s.target?.byGroup[k] ?? 0) / dim) * curDays;
              const a = tb.byGroup[k];
              const ach = t ? (a / t) * 100 : null;
              return {
                key: k,
                cells: [<b key="k">{k}</b>, rpc(t), <b key="a">{rpc(a)}</b>, <b key="p">{pct(ach, 0)}</b>],
                sub: <div className="flex items-center gap-2"><div className="flex-1"><Progress value={ach} tick={tgWeek} color={achColor(ach, tgWeek)} label={k} /></div><span className={a - t >= 0 ? "text-emerald-600" : "text-rose-600"}>Gap {rpc(a - t)}</span></div>,
              };
            }),
            (() => {
              const t = ((s.target?.total ?? 0) / dim) * curDays;
              return { key: "total", className: "bg-slate-50 font-black dark:bg-slate-800/50", cells: [<b key="k">Total</b>, rpc(t), <b key="a">{rpc(tb.sales)}</b>, <b key="p">{pct(t ? (tb.sales / t) * 100 : null, 0)}</b>], sub: <span className={tb.sales - t >= 0 ? "text-emerald-600" : "text-rose-600"}>Gap {rpc(tb.sales - t)}</span> };
            })(),
          ]}
        />
        <div className="sd-table-wrap max-sm:hidden"><table className="sd-table">
          <thead><tr><th>Grup</th><th className="n">Target Week</th><th className="n">Actual</th><th style={{ minWidth: 180 }}>Ach</th><th className="n">Gap</th></tr></thead>
          <tbody>
            {GROUPS.map((k) => {
              const t = ((s.target?.byGroup[k] ?? 0) / dim) * curDays;
              const a = tb.byGroup[k];
              const ach = t ? (a / t) * 100 : null;
              return <tr key={k}><td className="font-bold">{k}</td><td className="n">{rpf(t)}</td><td className="n">{rpf(a)}</td><td><div className="flex items-center gap-2"><div className="flex-1"><Progress value={ach} tick={tgWeek} color={achColor(ach, tgWeek)} label={k} /></div><b className="w-12 text-right text-xs">{pct(ach, 0)}</b></div></td><td className={`n ${a - t >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{rpf(a - t)}</td></tr>;
            })}
          </tbody>
          <tfoot><tr><td>Total</td><td className="n">{rpf(((s.target?.total ?? 0) / dim) * curDays)}</td><td className="n">{rpf(tb.sales)}</td><td>{pct(s.target?.total ? (tb.sales / (((s.target?.total ?? 0) / dim) * curDays)) * 100 : null, 0)}</td><td className="n">{rpf(tb.sales - ((s.target?.total ?? 0) / dim) * curDays)}</td></tr></tfoot>
        </table></div>
        <p className="mt-3 text-xs text-slate-500">Device = Apple + Android ({rpf(deviceOf(tb.byGroup))} di W{cur.index}).</p>
      </Panel>
    </div>
  );
}
