import Link from "next/link";
import { Activity, ChevronDown, Gauge, TrendingUp } from "lucide-react";
import { appConfig } from "@/config/app";
import { Panel, PageIntro, Progress } from "@/components/kit";
import { CopyButton, ParamDate, WhatsAppButton } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { APPLE_LOBS, VAS_PROVIDERS, linesByStaff, lobQty, vasSplit } from "@/lib/domain/extra";
import { byStaff, totals } from "@/lib/domain/kpi";
import { displayName } from "@/lib/domain/normalize";
import { daysInMonth, monthEnd, monthStart } from "@/lib/domain/period";
import { shareText } from "@/lib/domain/share";
import { dayDetail, homeView } from "@/lib/domain/views";
import { dateLong, dec, dmy, num, pct, rpf, timeAgo } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import type { SalesLine } from "@/types/domain";

type CardKind = "sales" | "VAS" | "ACC" | "upt";
interface PersonRow {
  key: string;
  name: string;
  sub: string;
  target: number;
  lines: SalesLine[];
}

/** Items a person sold for one card: grouped per description (qty, value), biggest first. */
function itemsOf(lines: SalesLine[]): Array<{ description: string; qty: number; amount: number }> {
  const m = new Map<string, { description: string; qty: number; amount: number }>();
  for (const l of lines) {
    const k = l.description || l.article;
    const x = m.get(k) ?? { description: k, qty: 0, amount: 0 };
    x.qty += l.qty;
    x.amount += l.amount;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

/**
 * Per-salesperson detail behind one card (popover; opens on a click anywhere on the card).
 * Sales / VAS / ACC: actual vs daily target per person; UPT: units, transactions and UPT per person.
 * Each person expands to the items they sold.
 */
function CardPeople({ id, title, kind, people }: { id: string; title: string; kind: CardKind; people: PersonRow[] }) {
  const pick = (ls: SalesLine[]) => (kind === "VAS" || kind === "ACC" ? ls.filter((l) => l.group === kind) : ls);
  const rows = people
    .map((r) => {
      const ls = pick(r.lines);
      const t = totals(ls);
      return { ...r, ls, actual: kind === "upt" ? t.qty : t.sales, t };
    })
    .filter((r) => r.actual !== 0 || (kind !== "upt" && r.target > 0))
    .sort((a, b) => b.actual - a.actual || b.target - a.target);
  const sumA = rows.reduce((a, r) => a + r.actual, 0);
  const sumT = rows.reduce((a, r) => a + r.target, 0);
  const inv = rows.reduce((a, r) => a + r.t.invoices, 0);
  return (
    <>
      <button type="button" popoverTarget={id} className="absolute inset-0 z-10 cursor-pointer rounded-[inherit]" aria-label={`Rincian ${title} per salesperson`} />
      <div id={id} popover="auto" className="m-auto w-[min(94vw,600px)] rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl backdrop:bg-slate-900/40 sm:p-5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="text-base font-black">{title} · per Salesperson</p>
          <button type="button" popoverTarget={id} popoverTargetAction="hide" className="sd-btn" aria-label="Tutup">✕</button>
        </div>
        <p className="mb-3 text-xs text-slate-500">{kind === "upt" ? "Unit terjual ÷ jumlah transaksi per orang." : "Target harian = target bulanan ÷ jumlah hari."} Ketuk nama untuk melihat barang yang terjual.</p>
        {rows.length ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 text-[13px] sm:text-sm dark:border-slate-700">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-2 sm:gap-x-3 bg-slate-50 px-3 py-2 text-[11px] font-black tracking-wide text-slate-500 uppercase dark:bg-slate-800/60">
              <span>Nama</span>
              <span className="w-[5.3rem] text-right sm:w-28">{kind === "upt" ? "Unit" : "Actual"}</span>
              <span className="w-[5.3rem] text-right sm:w-28">{kind === "upt" ? "Transaksi" : "Target"}</span>
              <span className="w-10 text-right sm:w-12">{kind === "upt" ? "UPT" : "%"}</span>
            </div>
            {rows.map((r) => (
              <details key={r.key} className="group border-t border-slate-200 dark:border-slate-700">
                <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-2 sm:gap-x-3 px-3 py-2 tabular-nums hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <span className="min-w-0"><b className="block leading-tight break-words">{displayName(r.name)} <span className="text-xs font-normal text-slate-400 group-open:rotate-90">›</span></b><span className="text-[11px] text-slate-400">{r.sub}</span></span>
                  <span className="w-20 text-right font-bold sm:w-28">{kind === "upt" ? num(r.t.qty) : rpf(r.actual)}</span>
                  <span className="w-20 text-right text-slate-500 sm:w-28">{kind === "upt" ? num(r.t.invoices) : r.target ? rpf(r.target) : "—"}</span>
                  <span className="w-10 text-right sm:w-12 font-bold">{kind === "upt" ? dec(r.t.upt ?? 0, 1).replace(",", ".") : r.target ? pct((r.actual / r.target) * 100, 0) : "—"}</span>
                </summary>
                <ul className="space-y-1 bg-slate-50/70 px-3 py-2 text-[12px] dark:bg-slate-800/30">
                  {itemsOf(r.ls).map((it) => (
                    <li key={it.description} className="flex justify-between gap-3">
                      <span className="min-w-0">{it.description} <span className="text-slate-400">× {num(it.qty)}</span></span>
                      <span className="shrink-0 tabular-nums">{rpf(it.amount)}</span>
                    </li>
                  ))}
                  {!r.ls.length && <li className="text-slate-400">Belum ada penjualan.</li>}
                </ul>
              </details>
            ))}
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-2 sm:gap-x-3 border-t border-slate-200 bg-slate-50 px-3 py-2 font-black tabular-nums dark:border-slate-700 dark:bg-slate-800/40">
              <span>Total</span>
              <span className="w-[5.3rem] text-right sm:w-28">{kind === "upt" ? num(sumA) : rpf(sumA)}</span>
              <span className="w-[5.3rem] text-right sm:w-28">{kind === "upt" ? num(inv) : rpf(sumT)}</span>
              <span className="w-10 text-right sm:w-12">{kind === "upt" ? dec(inv ? sumA / inv : 0, 1).replace(",", ".") : sumT ? pct((sumA / sumT) * 100, 0) : "—"}</span>
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-800/40">Belum ada penjualan pada tanggal ini.</p>
        )}
      </div>
    </>
  );
}

export default async function DailySalesPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Daily Sales" p={p} />;
  const s = p.snap;
  const dim = daysInMonth(p.month);
  const day = p.asOf;
  const dayLines = s.lines.filter((l) => l.date === day);
  const t = totals(dayLines);
  const tg = s.target?.byGroup ?? { Apple: 0, Android: 0, ACC: 0, VAS: 0 };
  const dailyTarget = (s.target?.total ?? 0) / dim;
  const dailyVas = tg.VAS / dim;
  const dailyAcc = tg.ACC / dim;
  const { staff, channels } = byStaff(dayLines, s.target, 1 / dim);
  const people = [...staff, ...channels].sort((a, b) => b.target - a.target || b.totals.sales - a.totals.sales);
  const byKey = linesByStaff(dayLines);
  const detail = dayDetail(s, day);
  const h = homeView(s, day);
  const text = shareText(h, appConfig().storeName);
  const sum = people.reduce((a, r) => ({ target: a.target + r.target, acc: a.acc + r.totals.byGroup.ACC, vas: a.vas + r.totals.byGroup.VAS, sales: a.sales + r.totals.sales }), { target: 0, acc: 0, vas: 0, sales: 0 });

  const cards = [
    { label: "Target vs Achievement", kind: "sales", actual: t.sales, target: dailyTarget, color: "#4a90ff", tone: "blue", icon: TrendingUp, ic: "bg-blue-50 text-blue-600" },
    { label: "VAS vs Achievement", kind: "VAS", actual: t.byGroup.VAS, target: dailyVas, color: "#42c77a", tone: "green", icon: Activity, ic: "bg-emerald-50 text-emerald-600" },
    { label: "ACC vs Achievement", kind: "ACC", actual: t.byGroup.ACC, target: dailyAcc, color: "#8a6fff", tone: "violet", icon: TrendingUp, ic: "bg-violet-50 text-violet-600" },
  ] as const;
  // per-salesperson rows behind the cards (target per card = that group's daily target)
  const peopleFor = (kind: CardKind): PersonRow[] =>
    people.map((r) => ({
      key: r.key,
      name: r.name,
      sub: r.isChannel ? "Online" : (r.nik ?? "—"),
      target: kind === "VAS" || kind === "ACC" ? r.targetByGroup[kind] : kind === "sales" ? r.target : 0,
      lines: byKey.get(r.key) ?? [],
    }));

  return (
    <div className="sd-content">
      <PageIntro
        title="Daily Sales"
        desc={`Seluruh data mengikuti tanggal terpilih: ${dmy(day)}.`}
        actions={
          <>
            <ParamDate param="d" value={day} min={monthStart(p.month)} max={s.lastDataDate ?? monthEnd(p.month)} className="w-44" />
            <Link href="/upload" prefetch={false} className="sd-btn">Kelola Data <ChevronDown className="size-4" /></Link>
          </>
        }
      />
      <p className="inline-flex w-fit flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700">
        <span className="size-2 rounded-full bg-emerald-500" />
        Aktivitas data terakhir: <b className="text-slate-700">dibaca {timeAgo(s.loadedAt)}</b> • {s.sourceTitle} • data s/d {s.lastDataDate ? dmy(s.lastDataDate) : "–"}
      </p>

      <Panel title="Share Report" desc="Pilih report yang ingin dibagikan ke WhatsApp." right={<div className="flex flex-wrap gap-2"><CopyButton text={text} label="Salin Teks" /><WhatsAppButton text={text} label="Share WhatsApp ›" /></div>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const a = c.target ? (c.actual / c.target) * 100 : null;
          const Icon = c.icon;
          return (
            <article key={c.label} className="sd-block-card relative p-5" data-tone={c.tone}>
              <CardPeople id={`card-${c.kind}`} title={c.kind === "sales" ? "Achievement" : c.kind} kind={c.kind} people={peopleFor(c.kind)} />
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-slate-500">{c.label}</p>
                <span className={`grid size-9 place-items-center rounded-[14px] ${c.ic}`}><Icon className="size-4" /></span>
              </div>
              <p className="mt-4 leading-tight font-black text-slate-950"><span className="block text-xl sm:text-2xl xl:text-xl 2xl:text-2xl">{rpf(c.actual)}</span><span className="block text-sm font-bold text-slate-500">dari target {rpf(c.target)}</span></p>
              <p className="mt-3 text-xs font-bold text-slate-500">{pct(a ?? 0, 0)}</p>
              <div className="mt-2"><Progress value={a} color={c.color} label={c.label} /></div>
              <p className="mt-2 text-xs font-semibold text-blue-600">Rincian per salesperson ›</p>
            </article>
          );
        })}
        <article className="sd-block-card relative p-5" data-tone="amber">
          <CardPeople id="card-upt" title="UPT" kind="upt" people={peopleFor("upt")} />
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-slate-500">UPT</p>
            <span className="grid size-9 place-items-center rounded-[14px] bg-amber-50 text-amber-600"><Gauge className="size-4" /></span>
          </div>
          <p className="mt-4 text-2xl font-black text-slate-950">{dec(t.upt, 1).replace(",", ".")}</p>
          <p className="mt-3 text-xs font-bold text-slate-500">{num(t.qty)} unit / {num(t.invoices)} transaksi</p>
          <p className="mt-2 text-xs font-semibold text-blue-600">Rincian per salesperson ›</p>
        </article>
      </div>

      <Panel title="Daily Sales Staff" desc={`Staff dengan target atau transaksi pada ${dateLong(day)}. Target harian = target bulanan staff ÷ ${dim} hari.`}>
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead><tr><th>Nama</th><th>Status</th><th className="n">Target</th><th className="n">ACC</th><th className="n">VAS</th><th className="n">Achievement</th><th className="n">%</th><th className="n">UPT</th><th className="n">ATV</th></tr></thead>
            <tbody>
              {people.map((r) => (
                <tr key={r.key}>
                  <td><p className="font-bold text-slate-950">{displayName(r.name)}</p><p className="text-xs text-slate-400">{r.isChannel ? "Online" : r.nik ?? "—"}</p></td>
                  <td>{r.totals.lines ? <span className="sd-badge green">Produktif</span> : <span className="sd-badge slate">Belum Produktif</span>}</td>
                  <td className="n">{rpf(r.target)}</td>
                  <td className="n">{rpf(r.totals.byGroup.ACC)}</td>
                  <td className="n">{rpf(r.totals.byGroup.VAS)}</td>
                  <td className="n font-black">{rpf(r.totals.sales)}</td>
                  <td className="n">{pct(r.target ? (r.totals.sales / r.target) * 100 : 0, 0)}</td>
                  <td className="n">{dec(r.totals.upt ?? 0, 1).replace(",", ".")}</td>
                  <td className="n">{rpf(r.totals.atv ?? 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>TOTAL</td><td>—</td><td className="n">{rpf(sum.target)}</td><td className="n">{rpf(sum.acc)}</td><td className="n">{rpf(sum.vas)}</td><td className="n">{rpf(sum.sales)}</td><td className="n">{pct(sum.target ? (sum.sales / sum.target) * 100 : 0, 0)}</td><td className="n">{dec(t.upt ?? 0, 1).replace(",", ".")}</td><td className="n">{rpf(t.atv ?? 0)}</td></tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Status shift (masuk / libur) belum tersedia — butuh data jadwal staff (<b>Need Data</b>).</p>
      </Panel>

      <Panel title="LOB Apple Daily" desc="iPhone, MacBook, iPad, dan Watch = device Apple • AirPods = accessories Apple">
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead><tr><th>Nama</th><th className="n">iPhone (Device)</th><th className="n">MacBook (Device)</th><th className="n">iPad (Device)</th><th className="n">Apple Watch (Device)</th><th className="n">AirPods (Accessories)</th></tr></thead>
            <tbody>
              {people.map((r) => {
                const q = lobQty(byKey.get(r.key) ?? []);
                return (
                  <tr key={r.key}><td className="font-bold">{displayName(r.name)}</td>{APPLE_LOBS.map((k) => <td key={k} className="n">{num(q[k])}</td>)}</tr>
                );
              })}
            </tbody>
            <tfoot><tr><td>TOTAL</td>{APPLE_LOBS.map((k) => <td key={k} className="n">{num(lobQty(dayLines)[k])}</td>)}</tr></tfoot>
          </table>
        </div>
      </Panel>

      <Panel title="VAS Daily" desc="Sumber Sales Person (brand Qoala / Telkomsel / XL / Indosat).">
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead><tr><th>Nama</th>{VAS_PROVIDERS.map((v) => <th key={v} className="n">{v} Qty / Value</th>)}</tr></thead>
            <tbody>
              {people.map((r) => {
                const v = vasSplit(byKey.get(r.key) ?? []);
                return <tr key={r.key}><td className="font-bold">{displayName(r.name)}</td>{VAS_PROVIDERS.map((k) => <td key={k} className="n">{num(v[k].qty)} / {rpf(v[k].value)}</td>)}</tr>;
              })}
            </tbody>
            <tfoot><tr><td>TOTAL</td>{VAS_PROVIDERS.map((k) => { const v = vasSplit(dayLines)[k]; return <td key={k} className="n">{num(v.qty)} / {rpf(v.value)}</td>; })}</tr></tfoot>
          </table>
        </div>
      </Panel>

      <Panel title={`Detail Invoice (${detail.invoices.length})`} desc="Klik invoice untuk melihat item.">
        {detail.invoices.length === 0 && <p className="text-sm text-slate-500">Tidak ada transaksi pada tanggal ini.</p>}
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {detail.invoices.map((inv) => (
            <details key={inv.invoice} className="group py-2">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 py-1">
                <span className="text-sm"><b>#{inv.invoice}</b> <span className="text-slate-500">· {[...new Set(inv.items.map((i) => displayName(i.staffName)))].join(", ")}</span></span>
                <span className="text-sm"><b>{rpf(inv.value)}</b> <span className="text-xs text-slate-500">· {inv.lines} baris · qty {num(inv.qty)}</span></span>
              </summary>
              <div className="mt-2 rounded-xl bg-slate-50 p-3">
                {inv.items.map((it, k) => (
                  <div key={k} className="flex justify-between gap-3 py-1 text-sm">
                    <div className="min-w-0"><p className="truncate">{it.description || it.article}</p><p className="text-xs text-slate-500">{it.article} · {it.group}{it.lob ? ` · ${it.lob}` : ""}{it.supplier ? ` · ${it.supplier}` : ""}{it.vasProvider ? ` · ${it.vasProvider}` : ""}</p></div>
                    <div className="text-right whitespace-nowrap">{it.countsInQty ? `${it.qty}× ` : ""}<b>{rpf(it.amount)}</b>{it.qtySource === "uncertain" && <span title="qty tidak pasti"> ?</span>}</div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </Panel>
    </div>
  );
}
