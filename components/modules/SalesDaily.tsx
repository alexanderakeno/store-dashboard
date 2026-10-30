import type { ReactNode } from "react";
import { MobileGrid } from "@/components/kit/MobileGrid";
import { displayName } from "@/lib/domain/normalize";
import { num, pct, rpc } from "@/lib/format";
import type { SalesLine } from "@/types/domain";

export interface QV {
  qty: number;
  value: number;
}
export type Split = Record<string, QV>;

export const sumQV = (m: Split): QV => Object.values(m).reduce((t, x) => ({ qty: t.qty + x.qty, value: t.value + x.value }), { qty: 0, value: 0 });

/**
 * Small stat tiles: one per key (label · value · qty, optional % vs a target). Keys with nothing sold are dimmed,
 * and hidden on phones to keep the list short.
 */
export function Tiles({ items, total, cols = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" }: { items: Array<{ key: string; label: string; v: QV; target?: number; unit?: string }>; total?: { label: string; v: QV; unit?: string }; cols?: string }) {
  return (
    <div className={`grid gap-2 ${cols}`}>
      {items.map(({ key, label, v, target, unit = "unit" }) => {
        const on = v.qty || v.value;
        const a = target ? (v.value / target) * 100 : null;
        return (
          <div key={key} className={`rounded-xl border px-3 py-2 ${on ? "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" : "border-dashed border-slate-200 bg-slate-50/60 max-sm:hidden dark:border-slate-700 dark:bg-slate-800/30"}`}>
            <p className={`truncate text-[11px] font-extrabold tracking-wide uppercase ${on ? "text-slate-500" : "text-slate-400"}`}>{label}</p>
            <p className={`mt-0.5 text-[15px] leading-tight font-black tabular-nums ${on ? "text-slate-950 dark:text-white" : "text-slate-300 dark:text-slate-600"}`}>{rpc(v.value)}</p>
            <p className="text-[11px] leading-snug text-slate-500 tabular-nums">
              {num(v.qty)} {unit}
              {a != null && <> · <b className={a >= 100 ? "text-emerald-600" : "text-rose-600"}>{pct(a, 0)}</b> dari {rpc(target)}</>}
            </p>
          </div>
        );
      })}
      {total && (
        <div className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-white dark:border-white dark:bg-white dark:text-slate-900">
          <p className="truncate text-[11px] font-extrabold tracking-wide uppercase opacity-70">{total.label}</p>
          <p className="mt-0.5 text-[15px] leading-tight font-black tabular-nums">{rpc(total.v.value)}</p>
          <p className="text-[11px] tabular-nums opacity-70">{num(total.v.qty)} {total.unit ?? "unit"}</p>
        </div>
      )}
    </div>
  );
}

/** Plain figure tiles (label · big value · small note). */
export function Stats({ items, cols = "grid-cols-2 sm:grid-cols-4" }: { items: Array<{ label: string; value: string; note?: string }>; cols?: string }) {
  return (
    <div className={`grid gap-2 ${cols}`}>
      {items.map((x) => (
        <div key={x.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">{x.label}</p>
          <p className="mt-0.5 text-[17px] leading-tight font-black tabular-nums">{x.value}</p>
          {x.note && <p className="text-[11px] text-slate-500">{x.note}</p>}
        </div>
      ))}
    </div>
  );
}

const qv = (x?: QV) =>
  x && (x.qty || x.value) ? (
    <span className="leading-tight">
      <b className="block">{num(x.qty)}</b>
      <span className="text-[11px] text-slate-500">{rpc(x.value)}</span>
    </span>
  ) : (
    <span className="text-slate-300 dark:text-slate-600">–</span>
  );

/**
 * One category of the day (Apple per LOB, Android per brand, VAS per provider) in the same layout:
 * summary tiles, then per salesperson — phones: name · unit · value + the split as a small line; wider screens:
 * a column per key with qty over value.
 */
export function CategoryDaily({
  keys,
  label = (k) => k,
  split,
  people,
  byKey,
  dayLines,
  empty,
  unit = "unit",
}: {
  keys: string[];
  label?: (k: string) => string;
  split: (lines: SalesLine[]) => Split;
  people: Array<{ key: string; name: string; isChannel?: boolean }>;
  byKey: Map<string, SalesLine[]>;
  dayLines: SalesLine[];
  empty: string;
  unit?: string;
}): ReactNode {
  const all = split(dayLines);
  const total = sumQV(all);
  const rows = people.map((r) => ({ r, m: split(byKey.get(r.key) ?? []) })).filter(({ m }) => sumQV(m).qty || sumQV(m).value);
  return (
    <div className="space-y-3">
      <Tiles items={keys.map((k) => ({ key: k, label: label(k), v: all[k] ?? { qty: 0, value: 0 }, unit }))} total={{ label: "Total", v: total, unit }} cols={`grid-cols-2 sm:grid-cols-3 ${keys.length > 4 ? "lg:grid-cols-6" : "lg:grid-cols-5"}`} />
      {rows.length ? (
        <>
          <MobileGrid
            cols={[{ label: "Salesperson" }, { label: unit === "unit" ? "Unit" : "Qty", w: "2.4rem" }, { label: "Value", w: "5.2rem" }]}
            rows={rows.map(({ r, m }) => {
              const t = sumQV(m);
              return {
                key: r.key,
                cells: [<b key="n" className="leading-tight">{displayName(r.name)}</b>, <b key="q">{num(t.qty)}</b>, <b key="v">{rpc(t.value)}</b>],
                sub: keys.filter((k) => m[k]?.qty || m[k]?.value).map((k) => `${label(k)} ${num(m[k].qty)} · ${rpc(m[k].value)}`).join("  |  "),
              };
            })}
            foot={["TOTAL", num(total.qty), rpc(total.value)]}
          />
          <div className="sd-table-wrap max-sm:hidden">
            <table className="sd-table">
              <thead>
                <tr><th>Salesperson</th>{keys.map((k) => <th key={k} className="n">{label(k)}</th>)}<th className="n">Total</th></tr>
              </thead>
              <tbody>
                {rows.map(({ r, m }) => (
                  <tr key={r.key}><td className="font-bold">{displayName(r.name)}{r.isChannel && <span className="ml-1 text-[11px] font-semibold text-slate-400">online</span>}</td>{keys.map((k) => <td key={k} className="n">{qv(m[k])}</td>)}<td className="n">{qv(sumQV(m))}</td></tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>TOTAL</td>{keys.map((k) => <td key={k} className="n">{qv(all[k])}</td>)}<td className="n">{qv(total)}</td></tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-slate-500 max-sm:hidden">Angka atas = {unit === "unit" ? "unit" : "qty"}, bawah = value.</p>
        </>
      ) : (
        <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-800/40">{empty}</p>
      )}
    </div>
  );
}
