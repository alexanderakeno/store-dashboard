import { Grid } from "@/components/kit/FitGrid";
import type { LobBreakdown, QV } from "@/lib/domain/extra";
import { displayName } from "@/lib/domain/normalize";
import { num, pct, rpc, rpf } from "@/lib/format";
import type { SalesLine } from "@/types/domain";

const APPLE_ROWS: Array<[string, string]> = [["iPhone", "iPhone"], ["iPad", "iPad"], ["Mac", "MacBook"], ["Apple Watch", "Apple Watch"], ["AirPods", "AirPods"]];
const ANDROID_ORDER = ["Samsung", "Oppo", "Xiaomi", "Infinix", "Motorola", "Amazfit", "Huawei", "Vivo", "Realme", "Tecno", "Honor"];

/** Row of the table a line belongs to (same split as lobBreakdown): a-<Apple LOB>, b-<Android brand>, acc, vas. */
function rowOf(l: SalesLine): string {
  if (l.lob === "AirPods" || l.group === "Apple") return `a-${l.lob || "Apple lainnya"}`;
  if (l.group === "Android") return `b-${l.lob || l.brand || "Lainnya"}`;
  return l.group === "ACC" ? "acc" : "vas";
}
const inRow = (key: string) => (l: SalesLine) => {
  const k = rowOf(l);
  return key === "g" || k === key || (key === "ta" && k.startsWith("a-")) || (key === "tn" && k.startsWith("b-"));
};

/** Items of one period: description, qty, value and who sold it, biggest first. */
function itemsOf(lines: SalesLine[]) {
  const m = new Map<string, { d: string; q: number; v: number; staff: Set<string> }>();
  for (const l of lines) {
    const k = l.description || l.article;
    const x = m.get(k) ?? { d: k, q: 0, v: 0, staff: new Set<string>() };
    x.q += l.qty;
    x.v += l.amount;
    if (l.staffName) x.staff.add(displayName(l.staffName));
    m.set(k, x);
  }
  return [...m.values()].sort((x, y) => y.v - x.v);
}

/** One period's list in the pop-up. */
function PeriodList({ title, lines }: { title: string; lines: SalesLine[] | null }) {
  const items = lines ? itemsOf(lines) : [];
  const qty = items.reduce((t, x) => t + x.q, 0);
  const value = items.reduce((t, x) => t + x.v, 0);
  return (
    <section className="min-w-0">
      <p className="mb-1.5 flex items-baseline justify-between gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-[13px] font-black dark:bg-slate-800">
        <span>{title}</span>
        <span className="text-xs font-bold text-slate-600 tabular-nums dark:text-slate-300">{lines ? `${rpc(value)} · ${num(qty)} unit` : "–"}</span>
      </p>
      {items.length ? (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-[13px] dark:divide-slate-800 dark:border-slate-700">
          {items.map((x) => (
            <li key={x.d} className="flex items-start justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block leading-snug font-semibold break-words">{x.d} <span className="font-normal text-slate-400">× {num(x.q)}</span></span>
                {x.staff.size > 0 && <span className="block text-[11px] text-slate-500">{[...x.staff].join(", ")}</span>}
              </span>
              <b className="shrink-0 tabular-nums">{rpc(x.v)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500 dark:bg-slate-800/40">{lines ? "Tidak ada penjualan." : "Belum ada week sebelumnya."}</p>
      )}
    </section>
  );
}

/** Pop-up of one row: the items of this period and of the previous one, each in its own list. */
function RowDetail({ id, label, wb, wa, lb, la }: { id: string; label: string; wb: string; wa: string; lb: SalesLine[]; la: SalesLine[] | null }) {
  return (
    <div id={id} popover="auto" className="m-auto max-h-[85dvh] w-[min(94vw,820px)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 text-left text-slate-900 shadow-2xl backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-base font-black">{label}</p>
        <button type="button" popoverTarget={id} popoverTargetAction="hide" className="sd-btn" aria-label="Tutup">✕</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PeriodList title={wb} lines={lb} />
        <PeriodList title={wa} lines={la} />
      </div>
    </div>
  );
}

/** "Weekly Dashboard" table: qty and value of period B vs period A (week to week, month to month), difference and % — Apple per LOB, Android per brand, ACC, VAS. */
export function LobCompare({ b, a, wb, wa, linesB, linesA, scope = "lob" }: { b: LobBreakdown; a: LobBreakdown | null; wb: string; wa: string; linesB?: SalesLine[]; linesA?: SalesLine[] | null; scope?: string }) {
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
  const popId = (key: string) => `${scope}-${key.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
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
          ...(linesB ? { pop: popId(r.key), label: `Barang terjual · ${r.label}` } : {}),
          className: r.tone === "grand" ? "bg-slate-100 font-black dark:bg-slate-800" : r.tone === "total" ? "bg-slate-50 font-bold dark:bg-slate-800/60" : "",
          cells: [
            <span key="n" className={r.tone ? "" : "font-semibold"}>{r.label}{linesB && <span className="ml-1 text-blue-500">›</span>}</span>,
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
      {linesB && rows.map((r) => <RowDetail key={r.key} id={popId(r.key)} label={r.label} wb={wb} wa={wa} lb={linesB.filter(inRow(r.key))} la={linesA ? linesA.filter(inRow(r.key)) : null} />)}
      <p className="mt-2 text-xs text-slate-500">{linesB ? "Ketuk nama LOB / brand untuk melihat barang yang terjual. " : ""}Δ dan % = {wb} dibanding {wa}. Grand Total = Apple + Android + ACC + VAS (sama dengan total sales).</p>
    </>
  );
}
