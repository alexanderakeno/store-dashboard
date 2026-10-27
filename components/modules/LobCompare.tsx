import { Grid } from "@/components/kit/FitGrid";
import type { LobBreakdown, QV } from "@/lib/domain/extra";
import { num, pct, rpc, rpf } from "@/lib/format";

const APPLE_ROWS: Array<[string, string]> = [["iPhone", "iPhone"], ["iPad", "iPad"], ["Mac", "MacBook"], ["Apple Watch", "Apple Watch"], ["AirPods", "AirPods"]];
const ANDROID_ORDER = ["Samsung", "Oppo", "Xiaomi", "Infinix", "Motorola", "Amazfit", "Huawei", "Vivo", "Realme", "Tecno", "Honor"];

/** "Weekly Dashboard" table: qty and value of period B vs period A (week to week, month to month), difference and % — Apple per LOB, Android per brand, ACC, VAS. */
export function LobCompare({ b, a, wb, wa }: { b: LobBreakdown; a: LobBreakdown | null; wb: string; wa: string }) {
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
