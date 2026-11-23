import type { ReactNode } from "react";
import { PageIntro, Panel } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { productType, timeGonePct } from "@/lib/domain/extra";
import { nameKey } from "@/lib/domain/normalize";
import { daysInMonth } from "@/lib/domain/period";
import { focusKey } from "@/lib/domain/views";
import { dayName, monthLabel, num, pct, rpc, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { GROUPS, type Group, type SalesLine } from "@/types/domain";

/** Sheet column label → sales group (null = the Total column, i.e. every group). */
const groupOf = (label: string): Group | null | undefined =>
  /^total/i.test(label) ? null : /apple/i.test(label) ? "Apple" : /android/i.test(label) ? "Android" : /acc/i.test(label) ? "ACC" : /vas/i.test(label) ? "VAS" : undefined;
const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const dm = (d: string) => `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}`;
const toneOf = (a: number | null, tg: number) =>
  a == null ? { txt: "text-slate-400", bar: "bg-slate-300" } : a >= tg ? { txt: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" } : a >= tg * 0.8 ? { txt: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" } : { txt: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500" };

/**
 * Target: the monthly target table exactly as written in the month's Google Sheet, tab "Dashboard"
 * (B6:G17) — target per staff per group (Apple · Android · Accesories · VAS · Total) and the sheet's
 * own Total row.
 */
export default async function TargetPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Target" p={p} />;
  const s = p.snap;
  const t = s.extras.dashTarget;
  const dim = daysInMonth(p.month);
  const intro = (
    <PageIntro title="Target" desc={`Target bulanan per staff · ${monthLabel(p.month)} · dari sheet "${s.sourceTitle}", tab Dashboard (B6:G17).`} />
  );
  if (!t) {
    return (
      <div className="sd-content">
        {intro}
        <div className="alert warn">
          {t === undefined
            ? "Data sheet belum dibaca ulang sejak menu ini dipasang — klik Perbarui di kanan atas untuk memuat tabel target."
            : 'Tabel target tidak ditemukan di tab "Dashboard" (B6:G17) file bulan ini.'}
        </div>
      </div>
    );
  }
  const last = t.cols.length - 1;
  // actual sales up to the data date, matched to the sheet's names
  const tg = timeGonePct(p.month, p.asOf);
  const mtd = s.lines.filter((l) => l.date <= p.asOf);
  const linesOf = (name: string | null) => (name == null ? mtd : mtd.filter((l) => nameKey(l.staffName) === nameKey(name)));
  const ofCol = (lines: SalesLine[], i: number) => {
    const g = groupOf(t.cols[i]);
    return g === undefined ? [] : g === null ? lines : lines.filter((l) => l.group === g);
  };
  const actualOf = (lines: SalesLine[], i: number) => ofCol(lines, i).reduce((a, l) => a + l.amount, 0);
  const popId = (r: number, i: number) => `ach-${r}-${i}`;
  /** Target value + achievement under it; opens the detail pop-up. */
  const Cell = ({ target, lines, id, label, big }: { target: number; lines: SalesLine[]; id: string; label: string; big?: boolean }) => {
    const actual = lines.reduce((a, l) => a + l.amount, 0);
    const a = target ? (actual / target) * 100 : null;
    return (
      <button type="button" popoverTarget={id} aria-label={`Detail pencapaian ${label}`} className="-m-1 rounded-lg p-1 text-right hover:bg-blue-50 dark:hover:bg-blue-950/40">
        <span className={`block tabular-nums ${big ? "font-black" : ""}`}>{rpf(target)}</span>
        <span className="block text-[11px] leading-tight whitespace-nowrap">
          <b className={toneOf(a, tg).txt}>{a == null ? "–" : pct(a, 0)}</b> <span className="text-slate-400">· {rpc(actual)}</span> <span className="text-blue-600">›</span>
        </span>
      </button>
    );
  };
  const pops: ReactNode[] = [];
  const addPop = (id: string, name: string, col: string, target: number, lines: SalesLine[], g: Group | null) =>
    pops.push(<AchPop key={id} id={id} name={name} col={col} target={target} lines={lines} group={g} tg={tg} asOf={p.asOf} dim={dim} month={p.month} />);
  const isTotalCol = (i: number) => /^total$/i.test(t.cols[i]);
  // the sheet's own Total row; summed from the staff rows only when the sheet has none
  const total = t.total ?? t.cols.map((_, i) => t.rows.reduce((a, r) => a + r.values[i], 0));
  const grand = total[last] || 0;
  t.rows.forEach((r, ri) => t.cols.forEach((c, i) => {
    const g = groupOf(c);
    if (g !== undefined) addPop(popId(ri, i), r.name, c, r.values[i], ofCol(linesOf(r.name), i), g);
  }));
  t.cols.forEach((c, i) => {
    const g = groupOf(c);
    if (g !== undefined) addPop(popId(-1, i), "Total Store", c, total[i], ofCol(mtd, i), g);
  });

  return (
    <div className="sd-content">
      {intro}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {t.cols.map((c, i) => (
          <article key={c} className={`sd-block-card p-3.5 sm:p-5 ${isTotalCol(i) ? "max-md:col-span-2" : ""}`} data-tone={isTotalCol(i) ? "blue" : undefined}>
            <p className="text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">{isTotalCol(i) ? "Total Store" : c}</p>
            <p className="sd-num mt-2 font-black">{rpf(total[i])}</p>
            <p className="text-[11px] font-bold text-slate-500 sm:text-xs">
              ≈ {rpc(total[i] / dim)} / hari{!isTotalCol(i) && grand ? ` · ${pct((total[i] / grand) * 100, 0)} dari total` : ""}
            </p>
          </article>
        ))}
      </div>

      <Panel title="Target per Staff" desc={`Sesuai tabel di sheet. Di bawah tiap target: % pencapaian · actual s/d ${dm(p.asOf)}. Ketuk angka untuk detail pencapaian. Target harian = target bulanan ÷ ${dim} hari.`}>
        {/* phone: one card per staff */}
        <div className="space-y-2 md:hidden">
          {t.rows.map((r) => (
            <div key={r.name} className={`rounded-2xl border border-slate-200 p-3 dark:border-slate-700 ${r.values.every((v) => !v) ? "opacity-60" : ""}`}>
              <button type="button" popoverTarget={popId(t.rows.indexOf(r), last)} className="flex w-full items-baseline justify-between gap-2 text-left">
                <p className="font-bold">{r.name}</p>
                <p className="font-black tabular-nums">{rpf(r.values[last])} <span className="text-[11px] text-blue-600">›</span></p>
              </button>
              <ul className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 border-t border-dashed border-slate-200 pt-2 text-sm dark:border-slate-700">
                {t.cols.slice(0, last).map((c, i) => {
                  const act = actualOf(linesOf(r.name), i);
                  const a = r.values[i] ? (act / r.values[i]) * 100 : null;
                  return (
                    <li key={c} className="min-w-0 text-[13px]">
                      <button type="button" popoverTarget={popId(t.rows.indexOf(r), i)} className="flex w-full justify-between gap-1.5 text-left">
                        <span className="text-slate-500">{c}</span>
                        <span className="text-right"><b className="tabular-nums">{rpc(r.values[i])}</b> <b className={`text-[11px] ${toneOf(a, tg).txt}`}>{a == null ? "" : pct(a, 0)}</b></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-950/40">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-black text-blue-700 dark:text-blue-300">TOTAL STORE</p>
              <p className="font-black tabular-nums">{rpf(total[last])}</p>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 border-t border-dashed border-blue-200 pt-2 text-sm dark:border-blue-800">
              {t.cols.slice(0, last).map((c, i) => (
                <li key={c} className="min-w-0 text-[13px]">
                  <button type="button" popoverTarget={popId(-1, i)} className="flex w-full justify-between gap-1.5 text-left">
                    <span className="text-slate-500">{c}</span>
                    <b className="tabular-nums">{rpc(total[i])}</b>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="sd-table-wrap hidden md:block">
          <table className="sd-table">
            <thead>
              <tr>
                <th>Nama</th>
                {t.cols.map((c, i) => <th key={c} className={`n ${isTotalCol(i) ? "!bg-blue-100 !text-blue-800 dark:!bg-blue-950 dark:!text-blue-200" : ""}`}>{c}</th>)}
                <th className="n">Per hari</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, ri) => (
                <tr key={r.name} className={r.values.every((v) => !v) ? "text-slate-400" : ""}>
                  <td className="font-bold">{r.name}</td>
                  {r.values.map((v, i) => (
                    <td key={i} className={`n ${isTotalCol(i) ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}>
                      <Cell target={v} lines={ofCol(linesOf(r.name), i)} id={popId(ri, i)} label={`${r.name} ${t.cols[i]}`} big={isTotalCol(i)} />
                    </td>
                  ))}
                  <td className="n text-slate-500 tabular-nums">{rpc(r.values[last] / dim)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL STORE</td>
                {total.map((v, i) => (
                  <td key={i} className={`n ${isTotalCol(i) ? "bg-blue-100 dark:bg-blue-950" : ""}`}>
                    <Cell target={v} lines={ofCol(mtd, i)} id={popId(-1, i)} label={`Total Store ${t.cols[i]}`} big />
                  </td>
                ))}
                <td className="n tabular-nums">{rpc(total[last] / dim)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
      {pops}
    </div>
  );
}

/** Pop-up: one staff × one category — achievement vs target and time gone, pace, and what was sold. */
function AchPop({ id, name, col, target, lines, group, tg, asOf, dim, month }: { id: string; name: string; col: string; target: number; lines: SalesLine[]; group: Group | null; tg: number; asOf: string; dim: number; month: string }) {
  const actual = lines.reduce((a, l) => a + l.amount, 0);
  const qty = lines.reduce((a, l) => a + (l.countsInQty ? l.qty : 0), 0);
  const a = target ? (actual / target) * 100 : null;
  const tone = toneOf(a, tg);
  const gap = actual - target;
  const pace = (target * tg) / 100;
  const sameMonth = asOf.slice(0, 7) === month;
  const daysLeft = sameMonth ? Math.max(0, dim - Number(asOf.slice(8))) : 0;
  // breakdown: per group for Total, otherwise LOB / brand / supplier / provider
  const parts = new Map<string, { value: number; qty: number }>();
  for (const l of lines) {
    const k = (group == null ? l.group : focusKey(group, l)) ?? "Lainnya";
    const e = parts.get(k) ?? { value: 0, qty: 0 };
    e.value += l.amount;
    e.qty += l.countsInQty ? l.qty : 0;
    parts.set(k, e);
  }
  const rows = group == null ? GROUPS.map((g) => ({ k: g as string, ...(parts.get(g) ?? { value: 0, qty: 0 }) })) : [...parts.entries()].map(([k, v]) => ({ k, ...v })).sort((x, y) => y.value - x.value);
  const prod = new Map<string, { qty: number; value: number }>();
  for (const l of lines) {
    if (!l.countsInQty) continue;
    const k = productType(l);
    const e = prod.get(k) ?? { qty: 0, value: 0 };
    e.qty += l.qty;
    e.value += l.amount;
    prod.set(k, e);
  }
  const top = [...prod.entries()].sort((x, y) => y[1].qty - x[1].qty || y[1].value - x[1].value).slice(0, 6);
  const H = ({ children }: { children: ReactNode }) => <p className="mt-4 mb-1.5 text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">{children}</p>;
  const Kv = ({ k, v, cls = "" }: { k: string; v: ReactNode; cls?: string }) => (
    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60"><p className="text-[10.5px] font-bold text-slate-500 uppercase">{k}</p><p className={`text-[14px] font-black tabular-nums ${cls}`}>{v}</p></div>
  );
  return (
    <div id={id} popover="auto" className="m-auto max-h-[90dvh] w-[min(94vw,520px)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl backdrop:bg-slate-900/40 sm:p-5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-black">{name} · {/^total/i.test(col) ? "Semua kategori" : col}</p>
          <p className="text-xs text-slate-500">Pencapaian s/d {dayName(asOf)} {dm(asOf)} · time gone {pct(tg, 0)}</p>
        </div>
        <button type="button" popoverTarget={id} popoverTargetAction="hide" className="sd-btn" aria-label="Tutup">✕</button>
      </div>

      <div className="mt-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <div className="flex items-end justify-between gap-3">
          <p className={`text-3xl leading-none font-black tabular-nums ${tone.txt}`}>{a == null ? "–" : pct(a, 0)}</p>
          <p className="text-right text-xs text-slate-500"><b className="text-base text-slate-900 dark:text-slate-100">{rpf(actual)}</b><br />dari target {rpf(target)}</p>
        </div>
        <div className="relative mt-2.5 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
          <span className={`absolute inset-y-0 left-0 rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, a ?? 0))}%` }} />
          {tg > 0 && tg < 100 && <i className="absolute -top-1 h-4 w-0.5 bg-slate-900 dark:bg-white" style={{ left: `${tg}%` }} title={`Time gone ${Math.round(tg)}%`} />}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Kv k={gap >= 0 ? "Lebih dari target" : "Sisa ke target"} v={rpc(Math.abs(gap))} cls={gap >= 0 ? "text-emerald-600 dark:text-emerald-400" : ""} />
        <Kv k="Unit terjual" v={`${num(qty)} unit`} />
        <Kv k={`Target s/d ${dm(asOf)}`} v={rpc(pace)} />
        <Kv k={actual >= pace ? "Di atas pace" : "Di bawah pace"} v={rpc(Math.abs(actual - pace))} cls={actual >= pace ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"} />
        {daysLeft > 0 && gap < 0 && <div className="col-span-2"><Kv k={`Perlu per hari (${daysLeft} hari lagi)`} v={rpc(-gap / daysLeft)} /></div>}
      </div>

      {rows.length > 0 && (
        <>
          <H>{group == null ? "Per kategori" : group === "Apple" ? "Per LOB" : group === "Android" ? "Per brand" : group === "ACC" ? "Per supplier" : "Per provider"}</H>
          <div className="overflow-hidden rounded-xl border border-slate-200 text-[13px] dark:border-slate-700">
            {rows.map((x) => (
              <div key={x.k} className="grid grid-cols-[minmax(0,1fr)_3.6rem_4.6rem_2.6rem] items-center gap-x-2 border-t border-slate-200 px-3 py-1.5 tabular-nums first:border-t-0 dark:border-slate-700">
                <b className="min-w-0 truncate">{x.k}</b>
                <span className="text-right text-[11px] text-slate-500">{num(x.qty)} unit</span>
                <span className="text-right font-bold">{rpc(x.value)}</span>
                <span className="text-right text-[11px] text-slate-500">{actual ? pct((x.value / actual) * 100, 0) : "–"}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {top.length > 0 && (
        <>
          <H>Produk terjual</H>
          <div className="overflow-hidden rounded-xl border border-slate-200 text-[13px] dark:border-slate-700">
            {top.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_2rem_4.6rem] items-center gap-x-2 border-t border-slate-200 px-3 py-1.5 tabular-nums first:border-t-0 dark:border-slate-700">
                <span className="min-w-0 break-words">{k}</span>
                <b className="text-right">{num(v.qty)}</b>
                <span className="text-right text-slate-500">{rpc(v.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {!lines.length && <p className="mt-4 text-sm text-slate-500">Belum ada penjualan.</p>}
    </div>
  );
}
