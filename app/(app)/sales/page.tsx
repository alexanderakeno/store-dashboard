import Link from "next/link";
import { Activity, ChevronDown, ChevronRight, Gauge, ShoppingBag, TrendingUp } from "lucide-react";
import { appConfig } from "@/config/app";
import { Panel, PageIntro, Progress } from "@/components/kit";
import { MobileGrid } from "@/components/kit/MobileGrid";
import { CopyButton, ParamDate, WhatsAppButton } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { APPLE_LOBS, VAS_PROVIDERS, linesByStaff, vasSplit } from "@/lib/domain/extra";
import { CategoryDaily, Stats, Tiles, sumQV, type Split } from "@/components/modules/SalesDaily";
import { byStaff, totals } from "@/lib/domain/kpi";
import { displayName } from "@/lib/domain/normalize";
import { daysInMonth, monthEnd, monthStart } from "@/lib/domain/period";
import { shareText } from "@/lib/domain/share";
import { dayDetail, homeView } from "@/lib/domain/views";
import { dateLong, dec, dmy, num, pct, rpc, rpf, timeAgo } from "@/lib/format";
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

/** Popup table: name · value (with target / transactions under it) · %. Fits a 360 px phone. */
const GRID = "grid grid-cols-[minmax(0,1fr)_auto_2.8rem] gap-x-2 px-3 sm:grid-cols-[minmax(0,1fr)_auto_3.2rem] sm:gap-x-3";

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

const LOB_LABEL: Record<string, string> = { iPhone: "iPhone", Mac: "MacBook", iPad: "iPad", "Apple Watch": "Apple Watch", AirPods: "AirPods" };
const add = (m: Split, k: string, l: SalesLine, unit: boolean) => {
  const e = (m[k] ??= { qty: 0, value: 0 });
  if (unit) e.qty += l.qty;
  e.value += l.amount;
};
/** Apple per LOB (device LOBs + AirPods); unit = qty rules. */
function appleSplit(lines: SalesLine[]): Split {
  const m: Split = {};
  for (const l of lines) if (l.lob && (APPLE_LOBS as readonly string[]).includes(l.lob)) add(m, l.lob, l, l.countsInQty);
  return m;
}
/** Android per brand. */
function androidSplit(lines: SalesLine[]): Split {
  const m: Split = {};
  for (const l of lines) if (l.group === "Android") add(m, l.lob || l.brand || "Lainnya", l, l.countsInQty);
  return m;
}
/** VAS per provider (every policy / package = 1). */
function vasQV(lines: SalesLine[]): Split {
  const v = vasSplit(lines);
  return Object.fromEntries(VAS_PROVIDERS.map((k) => [k, v[k]]));
}
/** ACC per supplier (AirPods shown as their own key). */
function accSplit(lines: SalesLine[]): Split {
  const m: Split = {};
  for (const l of lines) if (l.group === "ACC") add(m, l.lob === "AirPods" ? "AirPods" : l.supplier || displayName(l.brand || "Lainnya"), l, l.countsInQty);
  return m;
}

/**
 * Per-salesperson detail behind one card (popover; opens on a click anywhere on the card).
 * Sales / VAS / ACC: actual vs daily target per person; UPT: units, transactions and UPT per person.
 * Each person expands to the items they sold.
 */
function CardPeople({ id, title, kind, people, summary }: { id: string; title: string; kind: CardKind; people: PersonRow[]; summary?: React.ReactNode }) {
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
      <div id={id} popover="auto" className="m-auto max-h-[90dvh] w-[min(94vw,600px)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl backdrop:bg-slate-900/40 sm:p-5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="text-base font-black">{title}</p>
          <button type="button" popoverTarget={id} popoverTargetAction="hide" className="sd-btn" aria-label="Tutup">✕</button>
        </div>
        {summary && <div className="mt-2 mb-4">{summary}</div>}
        <p className="mb-2 text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">Per salesperson</p>
        <p className="mb-3 text-xs text-slate-500">{kind === "upt" ? "Unit terjual ÷ jumlah transaksi per orang." : "Target harian = target bulanan ÷ jumlah hari."} Ketuk nama untuk melihat barang yang terjual.</p>
        {rows.length ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 text-[13px] sm:text-sm dark:border-slate-700">
            <div className={`${GRID} bg-slate-50 py-2 text-[11px] font-black tracking-wide text-slate-500 uppercase dark:bg-slate-800/60`}>
              <span>Nama</span>
              <span className="text-right">{kind === "upt" ? "Unit · Transaksi" : "Actual · Target"}</span>
              <span className="text-right">{kind === "upt" ? "UPT" : "%"}</span>
            </div>
            {rows.map((r) => (
              <details key={r.key} className="group border-t border-slate-200 dark:border-slate-700">
                <summary className={`${GRID} cursor-pointer list-none items-center py-2 tabular-nums hover:bg-slate-50 dark:hover:bg-slate-800/40`}>
                  <span className="min-w-0"><b className="leading-tight break-words">{displayName(r.name)}</b> <span className="inline-block text-xs text-slate-400 transition group-open:rotate-90">›</span><span className="block text-[11px] text-slate-400">{r.sub}</span></span>
                  <span className="text-right leading-tight">
                    <b className="block whitespace-nowrap">{kind === "upt" ? `${num(r.t.qty)} unit` : rpf(r.actual)}</b>
                    <span className="text-[11px] whitespace-nowrap text-slate-500">{kind === "upt" ? `${num(r.t.invoices)} transaksi` : r.target ? `dari ${rpf(r.target)}` : "tanpa target"}</span>
                  </span>
                  <b className="text-right">{kind === "upt" ? dec(r.t.upt ?? 0, 1).replace(",", ".") : r.target ? pct((r.actual / r.target) * 100, 0) : "—"}</b>
                </summary>
                <ul className="space-y-1 bg-slate-50/70 px-3 py-2 text-[12px] dark:bg-slate-800/30">
                  {itemsOf(r.ls).map((it) => (
                    <li key={it.description} className="flex justify-between gap-3">
                      <span className="min-w-0 break-words">{it.description} <span className="text-slate-400">× {num(it.qty)}</span></span>
                      <span className="shrink-0 tabular-nums">{rpf(it.amount)}</span>
                    </li>
                  ))}
                  {!r.ls.length && <li className="text-slate-400">Belum ada penjualan.</li>}
                </ul>
              </details>
            ))}
            <div className={`${GRID} items-center border-t border-slate-200 bg-slate-50 py-2 font-black tabular-nums dark:border-slate-700 dark:bg-slate-800/40`}>
              <span>Total</span>
              <span className="text-right leading-tight">
                <span className="block whitespace-nowrap">{kind === "upt" ? `${num(sumA)} unit` : rpf(sumA)}</span>
                <span className="text-[11px] font-semibold whitespace-nowrap text-slate-500">{kind === "upt" ? `${num(inv)} transaksi` : `dari ${rpf(sumT)}`}</span>
              </span>
              <span className="text-right">{kind === "upt" ? dec(inv ? sumA / inv : 0, 1).replace(",", ".") : sumT ? pct((sumA / sumT) * 100, 0) : "—"}</span>
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
  const text = shareText(h, appConfig().storeName, s.lines);
  const sum = people.reduce((a, r) => ({ target: a.target + r.target, acc: a.acc + r.totals.byGroup.ACC, vas: a.vas + r.totals.byGroup.VAS, sales: a.sales + r.totals.sales }), { target: 0, acc: 0, vas: 0, sales: 0 });

  const dayDate = dateLong(day);
  const groupTarget = (g: "Apple" | "Android" | "ACC" | "VAS") => tg[g] / dim;
  const accAll = accSplit(dayLines);
  const accKeys = Object.keys(accAll).sort((a, b) => accAll[b].value - accAll[a].value);
  const vasAll = vasQV(dayLines);
  const appleAll = appleSplit(dayLines);
  const androidAll = androidSplit(dayLines);
  const androidKeys = Object.keys(androidAll).sort((a, b) => androidAll[b].qty - androidAll[a].qty || androidAll[b].value - androidAll[a].value);
  const groupQV = (g: "Apple" | "Android" | "ACC" | "VAS") => ({ qty: g === "VAS" ? sumQV(vasAll).qty : t.qtyByGroup[g], value: t.byGroup[g] });

  const cards = [
    {
      label: "Target vs Achievement", kind: "sales", title: `Achievement · ${dayDate}`, actual: t.sales, target: dailyTarget, color: "#3b82f6", tone: "blue", icon: TrendingUp, ic: "bg-blue-50 text-blue-600 dark:bg-blue-500/10",
      summary: (
        <div className="space-y-3">
          <Tiles items={(["Apple", "Android", "ACC", "VAS"] as const).map((g) => ({ key: g, label: g, v: groupQV(g), target: groupTarget(g) }))} total={{ label: "Total", v: { qty: t.qty, value: t.sales } }} cols="grid-cols-2 sm:grid-cols-5" />
          <Tiles items={[...APPLE_LOBS.map((k) => ({ key: k, label: LOB_LABEL[k], v: appleAll[k] ?? { qty: 0, value: 0 } })), ...androidKeys.map((k) => ({ key: k, label: k, v: androidAll[k] }))]} cols="grid-cols-3 sm:grid-cols-4" />
        </div>
      ),
    },
    {
      label: "VAS vs Achievement", kind: "VAS", title: `VAS · ${dayDate}`, actual: t.byGroup.VAS, target: dailyVas, color: "#10b981", tone: "green", icon: Activity, ic: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10",
      summary: <Tiles items={VAS_PROVIDERS.map((k) => ({ key: k, label: k, v: vasAll[k], unit: "polis" }))} total={{ label: "Total VAS", v: sumQV(vasAll), unit: "polis" }} cols="grid-cols-2 sm:grid-cols-5" />,
    },
    {
      label: "ACC vs Achievement", kind: "ACC", title: `ACC · ${dayDate}`, actual: t.byGroup.ACC, target: dailyAcc, color: "#8b5cf6", tone: "violet", icon: ShoppingBag, ic: "bg-violet-50 text-violet-600 dark:bg-violet-500/10",
      summary: accKeys.length ? <Tiles items={accKeys.map((k) => ({ key: k, label: k, v: accAll[k] }))} total={{ label: "Total ACC", v: sumQV(accAll) }} cols="grid-cols-2 sm:grid-cols-4" /> : undefined,
    },
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
  const tone = (a: number | null) => (a == null ? "bg-slate-100 text-slate-500" : a >= 100 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10" : a >= 80 ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10");

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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map((c) => {
          const a = c.target ? (c.actual / c.target) * 100 : null;
          const Icon = c.icon;
          const gap = c.actual - c.target;
          return (
            <article key={c.label} className="sd-block-card group relative flex flex-col p-3.5 sm:p-5" data-tone={c.tone}>
              <CardPeople id={`card-${c.kind}`} title={c.title} kind={c.kind} people={peopleFor(c.kind)} summary={c.summary} />
              <div className="flex min-h-9 items-center gap-2">
                <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${c.ic}`}><Icon className="size-4" /></span>
                <p className="min-w-0 flex-1 text-[12.5px] leading-tight font-bold text-slate-500 sm:text-sm">{c.label}</p>
              </div>
              <p className="mt-3 text-[17px] leading-tight font-black tracking-tight text-slate-950 tabular-nums sm:text-2xl xl:text-xl 2xl:text-2xl dark:text-white">{rpf(c.actual)}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500 tabular-nums sm:text-xs">Target {rpf(c.target)}</p>
              <div className="mt-3"><Progress value={a} color={c.color} label={c.label} /></div>
              <div className="mt-2 mb-3 flex items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(a)}`}>{pct(a ?? 0, 0)}</span>
                <span className={`truncate text-[11px] font-bold tabular-nums ${gap >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{gap >= 0 ? "+" : "−"}{rpc(Math.abs(gap))}</span>
              </div>
              <span className="mt-auto inline-flex items-center gap-0.5 self-start rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 transition group-hover:bg-slate-900 group-hover:text-white dark:bg-slate-800 dark:text-slate-200">Lihat detail <ChevronRight className="size-3.5" /></span>
            </article>
          );
        })}
        <article className="sd-block-card group relative flex flex-col p-3.5 sm:p-5" data-tone="amber">
          <CardPeople
            id="card-upt"
            title={`UPT · ${dayDate}`}
            kind="upt"
            people={peopleFor("upt")}
            summary={<Stats items={[{ label: "UPT", value: dec(t.upt, 2).replace(",", "."), note: "unit ÷ transaksi" }, { label: "Unit", value: num(t.qty), note: "device + aksesoris" }, { label: "Transaksi", value: num(t.invoices), note: "invoice" }, { label: "ATV", value: rpc(t.atv ?? 0), note: "sales ÷ transaksi" }]} />}
          />
          <div className="flex min-h-9 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10"><Gauge className="size-4" /></span>
            <p className="min-w-0 flex-1 text-[12.5px] leading-tight font-bold text-slate-500 sm:text-sm">UPT</p>
          </div>
          <p className="mt-3 text-[17px] leading-tight font-black text-slate-950 tabular-nums sm:text-2xl dark:text-white">{dec(t.upt, 2).replace(",", ".")}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500 tabular-nums sm:text-xs">{num(t.qty)} unit · {num(t.invoices)} transaksi</p>
          <p className="mt-3 mb-3 text-[11px] font-semibold text-slate-500 tabular-nums sm:text-xs">ATV <b className="text-slate-800 dark:text-slate-100">{rpf(t.atv ?? 0)}</b></p>
          <span className="mt-auto inline-flex items-center gap-0.5 self-start rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 transition group-hover:bg-slate-900 group-hover:text-white dark:bg-slate-800 dark:text-slate-200">Lihat detail <ChevronRight className="size-3.5" /></span>
        </article>
      </div>

      <Panel title="Daily Sales Staff" desc={`Staff dengan target atau transaksi pada ${dateLong(day)}. Target harian = target bulanan staff ÷ ${dim} hari.`}>
        <MobileGrid
          cols={[{ label: "Nama" }, { label: "Achievement", w: "6.4rem" }, { label: "%", w: "2.8rem" }, { label: "UPT", w: "2.2rem" }]}
          rows={people.map((r) => ({
            key: r.key,
            cells: [
              <span key="n"><b className="block leading-tight text-slate-950 dark:text-white">{displayName(r.name)}</b><span className="text-[11px] text-slate-400">{r.isChannel ? "Online" : r.nik ?? "—"}{r.totals.lines ? "" : " · belum produktif"}</span></span>,
              <b key="a">{rpf(r.totals.sales)}</b>,
              <span key="p" className={r.target && r.totals.sales >= r.target ? "font-bold text-emerald-600" : "font-bold"}>{r.target ? pct((r.totals.sales / r.target) * 100, 0) : "—"}</span>,
              dec(r.totals.upt ?? 0, 1).replace(",", "."),
            ],
            sub: <>Target {rpc(r.target)} · ACC {rpc(r.totals.byGroup.ACC)} · VAS {rpc(r.totals.byGroup.VAS)} · ATV {rpc(r.totals.atv ?? 0)}</>,
          }))}
          foot={["TOTAL", rpf(sum.sales), pct(sum.target ? (sum.sales / sum.target) * 100 : 0, 0), dec(t.upt ?? 0, 1).replace(",", ".")]}
        />
        <div className="sd-table-wrap max-sm:hidden">
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

      <Panel title="Apple Daily" desc="Per LOB: iPhone, MacBook, iPad, Apple Watch (device) dan AirPods (accessories Apple) — unit dan value.">
        <CategoryDaily keys={[...APPLE_LOBS]} label={(k) => LOB_LABEL[k] ?? k} split={appleSplit} people={people} byKey={byKey} dayLines={dayLines} empty="Belum ada penjualan Apple pada tanggal ini." />
      </Panel>

      <Panel title="Android Daily" desc="Per brand — unit dan value device Android.">
        <CategoryDaily keys={androidKeys} split={androidSplit} people={people} byKey={byKey} dayLines={dayLines} empty="Belum ada penjualan Android pada tanggal ini." />
      </Panel>

      <Panel title="VAS Daily" desc="Per provider: Qoala, Telkomsel, XL, Indosat — jumlah polis / paket dan value.">
        <CategoryDaily keys={[...VAS_PROVIDERS]} split={vasQV} people={people} byKey={byKey} dayLines={dayLines} empty="Belum ada penjualan VAS pada tanggal ini." unit="polis" />
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
