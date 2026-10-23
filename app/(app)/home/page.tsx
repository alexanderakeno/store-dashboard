import Link from "next/link";
import { appConfig } from "@/config/app";
import { EmptyBlock, NeedData, Panel, Progress, SectionHead, Trend, achColor, numClass } from "@/components/kit";
import { CopyButton, LineChart, ParamSelect, PrintButton, WhatsAppButton } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { APPLE_LOBS, VAS_PROVIDERS, linesIn, lobQty, lobValue, perfCards, staffStats, timeGonePct, vasSplit } from "@/lib/domain/extra";
import { totals } from "@/lib/domain/kpi";
import { sameRange } from "@/lib/domain/history";
import { sameMonthLastYear } from "@/lib/domain/period";
import { shareText } from "@/lib/domain/share";
import { homeView } from "@/lib/domain/views";
import { dec, monthLabel, monthShort, num, pct, pctArrow, rpc, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";
import { Mtm } from "./Mtm";
import { ProductDrill } from "@/components/modules/ProductDrill";
import { getMonthLines, type MonthSnapshot } from "@/lib/services/dashboard";
import type { MonthEntry } from "@/lib/repositories";
import type { SalesLine } from "@/types/domain";

const TONES = ["blue", "violet", "violet", "green", "amber"] as const;

type DetailRow = {
  label: string;
  actual: number;
  target: number | null;
  qty: number;
  note?: string;
  excluded?: boolean;
  /** Key for the per-product popup (articles → sales person), fetched from /api/drill on open. */
  drill?: string;
};

type Detail = { itemLabel: string; rows: DetailRow[]; footnote?: string };

const APPLE_LABELS: Record<(typeof APPLE_LOBS)[number], string> = { iPhone: "iPhone", Mac: "MacBook", iPad: "iPad", "Apple Watch": "Apple Watch", AirPods: "AirPods" };

/** Android devices per brand (lob = brand), largest value first. */
function androidBrands(lines: SalesLine[]): DetailRow[] {
  const map = new Map<string, DetailRow>();
  for (const l of lines) {
    if (l.group !== "Android") continue;
    const label = l.lob ?? "Lainnya";
    const r = map.get(label) ?? { label, actual: 0, target: null, qty: 0, drill: label };
    r.actual += l.amount;
    if (l.countsInQty) r.qty += l.qty;
    map.set(label, r);
  }
  return [...map.values()].filter((r) => r.actual !== 0 || r.qty !== 0).sort((a, b) => b.actual - a.actual);
}

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Overview" p={p} />;
  const tab = p.q.tab === "mtm" || p.q.tab === "ytd" || p.q.tab === "compare" ? p.q.tab : "monthly";
  const tabs = [
    { key: "monthly", label: "Overview Bulanan" },
    { key: "mtm", label: "MTM Overview" },
    { key: "ytd", label: "YTD Overview" },
    { key: "compare", label: `Compare ${Number(p.month.slice(0, 4)) - 1} vs ${p.month.slice(0, 4)}` },
  ];
  return (
    <div className="sd-content">
      <nav className="sd-tabs grid-cols-2 sm:grid-cols-4" aria-label="Tampilan overview">
        {tabs.map((t) => (
          <Link key={t.key} href={withQuery("/home", p.q, { tab: t.key === "monthly" ? null : t.key, vs: null })} className="sd-tab" aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "monthly" && <Monthly p={p} />}
      {tab === "mtm" && <Mtm snap={p.snap} asOf={p.asOf} months={p.months} q={p.q} />}
      {tab === "ytd" && <Ytd snap={p.snap} months={p.months} />}
      {tab === "compare" && <Compare snap={p.snap} months={p.months} />}
    </div>
  );
}

type Ok = Extract<Awaited<ReturnType<typeof loadPage>>, { state: "ok" }>;

async function Monthly({ p }: { p: Ok }) {
  const h = homeView(p.snap, p.asOf);
  const tg = timeGonePct(p.month, p.asOf);
  const pc = perfCards(h);
  const mtd = linesIn(p.snap, `${p.month}-01`, p.asOf);
const vs = vasSplit(mtd);
const grp = Object.fromEntries(h.groups.map((x) => [x.group, x]));
const aq = lobQty(mtd);
const av = lobValue(mtd);
const details: Partial<Record<string, Detail>> = {
  apple: {
    itemLabel: "Produk",
    rows: APPLE_LOBS.map((k) => ({ label: APPLE_LABELS[k], actual: av[k], target: null, qty: aq[k], drill: k, ...(k === "AirPods" ? { excluded: true, note: "ACC" } : {}) })),
    footnote: "AirPods ditampilkan untuk info saja — value-nya dihitung di ACC, bukan achievement Apple device.",
  },
  android: { itemLabel: "Brand", rows: androidBrands(mtd), footnote: "Device only, per brand." },
  vas: { itemLabel: "Provider", rows: VAS_PROVIDERS.map((k) => ({ label: k, actual: vs[k].value, target: null, qty: vs[k].qty, drill: k })) },
};
const grpCard = (key: string, label: string, x: (typeof h.groups)[number]) => ({ key, label, actual: x.actual, target: x.target, achievementPct: x.target ? (x.actual * 100) / x.target : null, estimate: x.estimate, points: x.point, pointsMax: x.pointCap, variance: x.actual - x.target });
const tt = h.achievement.target;
const total = { ...pc[0], target: tt, achievementPct: tt ? (pc[0].actual * 100) / tt : null, variance: pc[0].actual - tt };
const cards = [total, grpCard("apple", "Apple", grp.Apple), grpCard("android", "Android", grp.Android), pc[2], pc[3]];
  const staff = staffStats(mtd, p.snap.target, tg, { includeChannels: true });
  const people = staff.filter((s) => !s.isChannel);
  const needPush = people.filter((s) => s.status === "Need Push");
  const productive = people.filter((s) => s.status === "Productive");
  const avgUpt = h.totals.upt;
  const noTarget = !h.achievement.target;
  const picking = !!p.q.m;
  const cfg = appConfig();
  const lfl = await lastYear(p.months, p.month, p.asOf);

  return (
    <>
      <section className="sd-panel p-5">
        <p className="sd-label">Periode</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={withQuery("/home", {}, {})} className="sd-pill" aria-current={!picking ? "true" : undefined}>
              <span className={`inline-block size-3.5 rounded-full border-2 ${!picking ? "border-blue-600 bg-blue-600" : "border-slate-400"}`} />
              Bulan Berjalan
            </Link>
            <Link href={withQuery("/home", p.q, { m: p.month })} className="sd-pill" aria-current={picking ? "true" : undefined}>
              <span className={`inline-block size-3.5 rounded-full border-2 ${picking ? "border-blue-600 bg-blue-600" : "border-slate-400"}`} />
              Pilih Bulan
            </Link>
            {picking && (
              <ParamSelect param="m" value={p.month} reset={["d"]} className="w-48" options={p.months.map((m) => ({ value: m.month, label: monthLabel(m.month) }))} />
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-500">{monthLabel(p.month)}</p>
            <p className="text-xs text-slate-400">Data s/d {p.asOf.slice(8)}/{p.asOf.slice(5, 7)} · Time gone {pct(tg)}</p>
          </div>
        </div>
      </section>

      <div className="space-y-4">
        <SectionHead title="Store Performance" desc="Actual vs target bulan terpilih." />
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {cards.map((c, i) => (
            <article key={c.key} className={`sd-block-card relative p-5 ${c.key === "total" ? "sm:col-span-2 2xl:col-span-4" : ""}`} data-tone={TONES[i]}>
{details[c.key] && <CardDetail id={`detail-${c.key}`} title={c.label} detail={details[c.key]!} total={c.actual} tg={tg} drillQuery={`m=${p.month}&d=${p.asOf}&g=${c.key}`} />}
              <p className="text-xs font-black tracking-[.08em] text-slate-500 uppercase">{c.label}</p>
              <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{rpf(c.actual)}</p>
              <div className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-[13px] dark:border-slate-700">
                <div className="flex justify-between gap-2"><span className="text-slate-500">Target {rpf(c.target)}</span><b className={c.achievementPct != null && c.achievementPct < tg ? "text-rose-600" : "text-slate-900"}>{c.achievementPct == null ? "—" : `${c.achievementPct >= tg ? "▲" : "▼"} ${pct(c.achievementPct, 0)}`}</b></div>
                <div className="flex flex-wrap justify-between gap-x-2"><span className="font-semibold whitespace-nowrap text-blue-600">Est. {rpf(c.estimate)}{c.target > 0 && <span className="ml-1">({pct((c.estimate / c.target) * 100, 0)})</span>}</span><b className="whitespace-nowrap text-slate-900">{dec(c.points, 1).replace(",0", "")}/{c.pointsMax} pts</b></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Variance</span><b className={c.variance >= 0 ? "text-emerald-600" : "text-rose-600"}>{rpf(c.variance)}</b></div>
{details[c.key] && <p className="pt-1 text-xs font-semibold text-blue-600">Klik untuk rincian ›</p>}
              </div>
            </article>
          ))}
        </div>
      </div>

      <Panel title="Team Performance">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
          <Mini label="Total Staff" value={num(people.length)} />
          <Mini label="Productive" value={num(productive.length)} />
          <Mini label="Need Push" value={num(needPush.length)} />
          <Mini label="Total Transaction" value={num(h.totals.invoices)} />
          <Mini label="Avg UPT" value={dec(avgUpt, 1).replace(",", ".")} />
          <Mini label="Avg ATV" value={rpf(h.totals.atv)} />
        </div>
      </Panel>

      <Panel title="Month Progress" desc="Progress target dan produktivitas transaksi." right={noTarget ? <span className="sd-badge red">Target belum ada</span> : <span className={`sd-badge ${(h.achievement.achievementPct ?? 0) >= tg ? "green" : "red"}`}>{(h.achievement.achievementPct ?? 0) >= tg ? "On Track" : "Behind"}</span>}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
          <Kv label="Target" value={rpf(h.achievement.target)} />
          <Kv label="Achievement" value={<>{rpf(h.totals.sales)} • {pctArrow(h.achievement.achievementPct ?? 0, 0)}</>} />
          <Kv label="Gap" value={<span className={h.achievement.gap >= 0 ? "text-emerald-600" : "text-rose-600"}>{rpf(h.achievement.gap)}</span>} />
          <Kv label="Month Pace (Time Gone)" value={`▲ ${pct(tg)}`} />
          <Kv label="UPT" value={dec(h.totals.upt, 1).replace(",", ".")} />
          <Kv label="ATV" value={rpf(h.totals.atv)} />
          <Kv label="Transaction" value={num(h.totals.invoices)} />
          <Kv label="Estimasi Closing" value={<>{rpf(h.estimate)} {h.estimatePct != null && <span className="text-sm text-slate-500">({pct(h.estimatePct, 0)})</span>}</>} />
        </div>
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs font-semibold text-slate-500">
            <span>Achievement {pct(h.achievement.achievementPct ?? 0)}</span>
            <span>Time gone {pct(tg)}</span>
          </div>
          <Progress value={h.achievement.achievementPct} tick={tg} color={achColor(h.achievement.achievementPct, tg)} label="Achievement bulan ini" />
        </div>
      </Panel>

      <Panel title="Pencapaian per Grup" desc="MTD vs target bulanan · garis tipis di bar = time gone." right={<span className="sd-badge blue">Time gone {pct(tg)}</span>}>
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead>
              <tr><th>Grup</th><th className="n">Actual</th><th className="n max-sm:hidden">Target</th><th className="max-sm:text-right sm:min-w-40">Ach</th><th className="n max-sm:hidden">Time Gone</th><th className="n max-sm:hidden">Gap</th><th className="n max-sm:hidden">Estimasi</th><th className="n max-sm:hidden">Qty</th><th className="n"><span className="max-sm:hidden">Point</span><span className="sm:hidden">Pts</span></th></tr>
            </thead>
            <tbody>
              {h.groups.map((g) => (
                <tr key={g.group}>
                  <td className="font-bold">{g.group}</td>
                  <td className="n">{rpf(g.actual)}</td>
                  <td className="n max-sm:hidden">{rpf(g.target)}</td>
                  <td>
                    <div className="flex items-center justify-end gap-2 sm:justify-start">
                      <div className="flex-1 max-sm:hidden"><Progress value={g.achievementPct} tick={tg} color={achColor(g.achievementPct, tg)} label={`Pencapaian ${g.group}`} /></div>
                      <b className="text-right text-xs sm:w-12">{pct(g.achievementPct, 0)}</b>
                    </div>
                  </td>
                  <td className="n max-sm:hidden">{pct(tg)}</td>
                  <td className={`n font-semibold max-sm:hidden ${g.gap >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{rpf(g.gap)}</td>
                  <td className="n max-sm:hidden">{rpf(g.estimate)} <span className="text-xs text-slate-500">{pct(g.estimatePct, 0)}</span></td>
                  <td className="n max-sm:hidden">{num(g.qty)}</td>
                  <td className="n">{dec(g.point, 1)} <span className="text-xs text-slate-500 max-sm:hidden">/ {g.pointCap}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="n">{rpf(h.totals.sales)}</td>
                <td className="n max-sm:hidden">{rpf(h.achievement.target)}</td>
                <td className="max-sm:text-right">{pct(h.achievement.achievementPct, 0)}</td>
                <td className="n max-sm:hidden">{pct(tg)}</td>
                <td className="n max-sm:hidden">{rpf(h.achievement.gap)}</td>
                <td className="n max-sm:hidden">{rpf(h.estimate)}</td>
                <td className="n max-sm:hidden">{num(h.totals.qty)}</td>
                <td className="n">{dec(h.points.total, 1)}<span className="max-sm:hidden"> / {h.points.max}</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500"><span className="sm:hidden">Target, gap, estimasi & qty lengkap tampil di layar lebar. </span>Time gone = tanggal data terupdate ÷ jumlah hari bulan ini × 100. AirPods dihitung di ACC.</p>
      </Panel>


      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Top Performance">
          <ol className="divide-y divide-slate-200 dark:divide-slate-700">
            {people.slice(0, 3).map((s, i) => (
              <li key={s.key} className="flex items-center gap-3 py-3">
                <span className="grid size-8 place-items-center rounded-full bg-blue-50 text-sm font-black text-blue-600">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-950">{s.name}</p>
                  <p className="text-xs text-slate-500">UPT {dec(s.totals.upt, 1).replace(",", ".")} • ATV {rpf(s.totals.atv)}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-slate-950">{rpf(s.totals.sales)}</p>
                  <p className="text-xs text-slate-500">{s.target ? pct(s.achievementPct, 0) : "—"}</p>
                </div>
              </li>
            ))}
            {!people.length && <li className="py-3 text-sm text-slate-500">Belum ada transaksi.</li>}
          </ol>
        </Panel>
        <Panel title="Need Push">
          {needPush.length === 0 ? (
            <p className="text-sm text-slate-500">{noTarget ? "Target staff belum ada — status dihitung setelah target terbaca." : "Tidak ada staff Need Push."}</p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {needPush.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">{s.name}</p>
                    <p className="text-xs text-slate-500">{rpf(s.totals.sales)} / {rpf(s.target)}</p>
                  </div>
                  <span className="sd-badge red">{pct(s.achievementPct, 0)} · TG {pct(tg, 0)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Staff Productivity" desc="Staff mengikuti histori transaksi pada bulan terpilih, bukan roster aktif saat ini.">
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead>
              <tr><th>Staff</th><th className="n">Sales</th><th className="n max-sm:hidden">Trx</th><th className="n max-sm:hidden">Device</th><th className="n max-sm:hidden">Accessories</th><th className="n max-sm:hidden">VAS</th><th className="n max-sm:hidden">UPT</th><th className="n max-sm:hidden">ATV</th><th>Status</th></tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.key}>
                  <td className="font-bold text-slate-950">{s.name}{s.isChannel && <span className="text-xs font-semibold text-slate-400 max-sm:block sm:ml-2">online</span>}</td>
                  <td className="n">{rpf(s.totals.sales)}</td>
                  <td className="n max-sm:hidden">{num(s.totals.invoices)}</td>
                  <td className="n max-sm:hidden">{rpf(s.device)}</td>
                  <td className="n max-sm:hidden">{rpf(s.acc)}</td>
                  <td className="n max-sm:hidden">{rpf(s.vas)}</td>
                  <td className="n max-sm:hidden">{dec(s.totals.upt, 1).replace(",", ".")}</td>
                  <td className="n max-sm:hidden">{rpf(s.totals.atv)}</td>
                  <td><span className={`sd-badge ${s.status === "Productive" ? "green" : "red"}`}><span className="max-sm:hidden">{s.status}</span><span className="sm:hidden">{s.status === "Productive" ? "OK" : "Push"}</span></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Sales Trend" desc="Tanggal vs Total Sales bulan terpilih.">
        <LineChart data={h.series.map((d) => ({ label: d.date.slice(8), value: d.sales, tip: `${d.date.slice(8)} ${monthShort(p.month)}` }))} />
      </Panel>

      <Panel title="LFL Summary" desc="Bulan terpilih dibanding bulan yang sama tahun sebelumnya." right={lfl ? undefined : <NeedData />}>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <Kv label={monthShort(sameMonthLastYear(p.month))} value={lfl ? rpf(lfl.sales) : <span className="text-slate-400">—</span>} />
          <Kv label={monthShort(p.month)} value={rpf(h.totals.sales)} />
          <Kv label="Growth" value={lfl ? <Trend value={lfl.sales ? ((h.totals.sales - lfl.sales) / lfl.sales) * 100 : null} digits={1} /> : <span className="text-slate-400">—</span>} />
          <Kv label="Selisih" value={lfl ? rpf(h.totals.sales - lfl.sales) : <span className="text-slate-400">—</span>} />
        </div>
        {lfl && (
          <div className="mt-4 grid grid-cols-2 gap-5 border-t border-dashed border-slate-200 pt-4 md:grid-cols-4 dark:border-slate-700">
            <Kv label={`Qty ${monthShort(sameMonthLastYear(p.month))}`} value={num(lfl.qty)} />
            <Kv label={`Qty ${monthShort(p.month)}`} value={num(h.totals.qty)} />
            <Kv label="Growth Qty" value={<Trend value={lfl.qty ? ((h.totals.qty - lfl.qty) / lfl.qty) * 100 : null} digits={1} />} />
            <Kv label="Selisih Qty" value={num(h.totals.qty - lfl.qty)} />
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          {lfl
            ? `Periode sama: tanggal 1–${Number(p.asOf.slice(8))}.${lfl.source === "mr" ? ` Data ${monthLabel(sameMonthLastYear(p.month))} dari Merchandise Report yang di-upload.` : ""} Rincian per grup & LOB ada di tab Compare.`
            : `Upload Merchandise Report ${monthLabel(sameMonthLastYear(p.month))} di Data Upload → Import Data Penjualan untuk mengaktifkan LFL (periode yang sama, tanggal 1–${Number(p.asOf.slice(8))}).`}
        </p>
      </Panel>

      <Panel title="Share Daily" desc="Ringkasan harian untuk WhatsApp." right={<div className="flex gap-2"><CopyButton text={shareText(h, cfg.storeName)} label="Salin teks" /><WhatsAppButton text={shareText(h, cfg.storeName)} /></div>}>
        <pre className="m-0 rounded-2xl bg-slate-50 p-4 font-[inherit] text-sm whitespace-pre-wrap text-slate-700">{shareText(h, cfg.storeName)}</pre>
      </Panel>
    </>
  );
}

function CardDetail({ id, title, detail, total, tg, drillQuery }: { id: string; title: string; detail: Detail; total: number; tg: number; drillQuery: string }) {
  const { rows, itemLabel, footnote } = detail;
  const counted = rows.filter((r) => !r.excluded);
  const hasTarget = rows.some((r) => r.target != null);
  const other = total - counted.reduce((a, r) => a + r.actual, 0);
  return (
    <>
      <button type="button" popoverTarget={id} className="absolute inset-0 z-10 cursor-pointer rounded-[inherit]" aria-label={`Rincian ${title}`} />
      <div id={id} popover="auto" className="m-auto w-[min(94vw,480px)] rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 text-slate-900 shadow-2xl backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-base font-black">Rincian {title}</p>
          <button type="button" popoverTarget={id} popoverTargetAction="hide" className="sd-btn" aria-label="Tutup">✕</button>
        </div>
        <div className="sd-table-wrap">
          <table className="sd-table sd-table-compact">
            <thead>
              <tr><th>{itemLabel}</th><th className="n">Actual</th>{hasTarget ? <><th className="n">Target</th><th className="n">Ach</th></> : <th className="n max-sm:hidden">Share</th>}<th className="n">Qty</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const ach = r.target ? (r.actual / r.target) * 100 : null;
                const share = total && !r.excluded ? pct((r.actual / total) * 100, 0) : "—";
                const drill = r.drill ? `${id}-${i}` : null;
                return (
                  <tr key={r.label} className={r.excluded ? "text-slate-500" : undefined}>
                    <td className="font-bold">
                      {drill ? (
                        <button type="button" popoverTarget={drill} className="text-left font-bold text-blue-600 underline-offset-2 hover:underline">{r.label} ›</button>
                      ) : (
                        r.label
                      )}
                      {r.note && <span className="ml-1.5 text-[11px] font-semibold text-slate-400">({r.note})</span>}
                      {!hasTarget && <span className="block text-[11px] font-semibold text-slate-400 sm:hidden">{share === "—" ? "tidak dihitung" : `share ${share}`}</span>}
                    </td>
                    <td className="n">{rpf(r.actual)}</td>
                    {hasTarget ? <><td className="n">{rpf(r.target ?? 0)}</td><td className={`n font-semibold ${ach != null && ach >= tg ? "text-emerald-600" : "text-rose-600"}`}>{ach == null ? "—" : pct(ach, 0)}</td></> : <td className="n max-sm:hidden">{share}</td>}
                    <td className="n">{num(r.qty)}</td>
                  </tr>
                );
              })}
              {Math.abs(other) >= 1 && <tr><td className="text-slate-500">Lainnya</td><td className="n">{rpf(other)}</td>{hasTarget ? <><td /><td /></> : <td className="n max-sm:hidden">{total ? pct((other / total) * 100, 0) : "—"}</td>}<td /></tr>}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td className="n">{rpf(total)}</td>{hasTarget ? <><td /><td /></> : <td className="max-sm:hidden" />}<td className="n">{num(counted.reduce((a, r) => a + r.qty, 0))}</td></tr>
            </tfoot>
          </table>
        </div>
        {footnote && <p className="mt-3 text-xs text-slate-500">{footnote}</p>}
        {rows.some((r) => r.drill) && <p className={`${footnote ? "mt-1" : "mt-3"} text-xs text-slate-400`}>Klik nama {itemLabel.toLowerCase()} untuk rincian artikel & sales person.</p>}
        {rows.map((r, i) =>
          r.drill ? (
            <ProductDrill key={r.label} id={`${id}-${i}`} group={title} label={r.label} actual={r.actual} qty={r.qty} share={total && !r.excluded ? (r.actual / total) * 100 : null} query={`${drillQuery}&k=${encodeURIComponent(r.drill)}`} />
          ) : null,
        )}
      </div>
    </>
  );
}

function Kv({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="sd-num mt-1 font-black text-slate-950 sm:!text-lg">{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-3.5 dark:border-slate-700">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`${numClass(value)} mt-1 font-black text-slate-950`}>{value}</p>
    </div>
  );
}

/**
 * Same month last year, same day range. Comes from the registered monthly sheet or, when that month
 * has no sheet, from an imported Merchandise Report (Data Upload → Import Data Penjualan).
 */
async function lastYear(months: MonthEntry[], month: string, asOf: string) {
  const ly = await getMonthLines(sameMonthLastYear(month), months).catch(() => null);
  if (!ly) return null;
  const day = asOf.slice(8);
  return { ...totals(ly.lines.filter((l) => l.date.slice(8) <= day)), source: ly.source };
}

/* ---------------- YTD ---------------- */

const MONTH_NUMS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

/** Lines per month of `year` up to `upTo` — monthly sheet or imported Merchandise Report. */
async function loadYear(months: MonthEntry[], year: string, upTo: string): Promise<Map<string, SalesLine[]>> {
  const out = new Map<string, SalesLine[]>();
  const keys = MONTH_NUMS.map((n) => `${year}-${n}`).filter((m) => m <= upTo);
  await Promise.all(
    keys.map(async (m) => {
      const x = await getMonthLines(m, months).catch(() => null);
      if (x) out.set(m, x.lines);
    }),
  );
  return out;
}


async function Ytd({ snap, months }: { snap: MonthSnapshot; months: MonthEntry[] }) {
  const year = snap.month.slice(0, 4);
  const prevYear = String(Number(year) - 1);
  const mm = snap.month.slice(5);
  const cur = await loadYear(months, year, snap.month);
  const prev = await loadYear(months, prevYear, `${prevYear}-${mm}`);
  // fair YTD: only months that have data in both years, each cut to the same days when one side is
  // incomplete (current month, or an imported file that ends mid-month)
  const both = MONTH_NUMS.filter((n) => n <= mm && cur.has(`${year}-${n}`) && prev.has(`${prevYear}-${n}`));
  const pairs = both.map((n) => ({ n, ...sameRange(`${year}-${n}`, `${prevYear}-${n}`, cur.get(`${year}-${n}`), prev.get(`${prevYear}-${n}`)) }));
  const curLines = pairs.flatMap((x) => x.cur ?? []);
  const prevLines = pairs.flatMap((x) => x.prev ?? []);
  const cutNote = pairs.filter((x) => x.upTo).map((x) => `${monthShort(`${year}-${x.n}`).split(" ")[0]} tgl 1–${x.upTo}`);
  const onlyOne = MONTH_NUMS.filter((n) => n <= mm && cur.has(`${year}-${n}`) !== prev.has(`${prevYear}-${n}`)).map((n) => monthShort(`${year}-${n}`).split(" ")[0]);
  const ct = totals(curLines);
  const pt = totals(prevLines);
  const cl = lobQty(curLines);
  const cv = lobValue(curLines);
  const pl = lobQty(prevLines);
  const pv = lobValue(prevLines);
  const g = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);
  const missingCur = MONTH_NUMS.filter((n) => n <= mm && !cur.has(`${year}-${n}`)).length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <span className="sd-pill">📅 Jan – {monthShort(snap.month).split(" ")[0]}</span>
          <span className="sd-pill">{year}</span>
        </div>
        <div className="flex gap-2">
          <PrintButton />
        </div>
      </div>
      <Panel title={`YTD ${prevYear} vs ${year}`} desc={`Januari – ${monthLabel(snap.month).split(" ")[0]}, dibanding apple-to-apple: bulan & tanggal yang sama di kedua tahun.`}>
        {missingCur > 0 && <p className="mb-4 text-sm text-amber-700">{missingCur} bulan {year} belum ada datanya.</p>}
        <p className="mb-4 text-xs text-slate-500">
          YTD dihitung dari {both.length} bulan yang datanya ada di kedua tahun{cutNote.length ? `; ${cutNote.join(", ")} dibanding pada tanggal yang sama` : ""}.
          {onlyOne.length ? ` Tidak dihitung (data hanya ada di satu tahun): ${onlyOne.join(", ")}.` : ""}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <YearCard year={prevYear} tone="blue" qty={pt.qty} value={pt.sales} lob={pl} lobV={pv} need={prev.size === 0} />
          <YearCard year={year} tone="green" qty={ct.qty} value={ct.sales} lob={cl} lobV={cv} growthQty={prev.size ? g(ct.qty, pt.qty) : null} growthValue={prev.size ? g(ct.sales, pt.sales) : null} lobPrev={prev.size ? pl : null} />
        </div>
      </Panel>
      <Panel title="Detail Per Bulan">
        <MonthTable year={year} prevYear={prevYear} cur={cur} prev={prev} upTo={mm} />
      </Panel>
    </>
  );
}

function YearCard({ year, tone, qty, value, lob, lobV, need, growthQty, growthValue, lobPrev }: { year: string; tone: "blue" | "green"; qty: number; value: number; lob: Record<string, number>; lobV: Record<string, number>; need?: boolean; growthQty?: number | null; growthValue?: number | null; lobPrev?: Record<string, number> | null }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
      <div className={`px-4 py-3 text-lg font-black ${tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{year}</div>
      <div className="p-4">
        {need ? (
          <EmptyBlock title={`Data ${year}`}>Upload Merchandise Report {year} per bulan di Data Upload → Import Data Penjualan untuk perbandingan YTD.</EmptyBlock>
        ) : (
          <>
            <p className="text-xs font-black tracking-[.08em] text-slate-500 uppercase">All Sales</p>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <div><p className="text-xs text-slate-500">Qty</p><p className="text-2xl font-black">{num(qty)}</p>{growthQty !== undefined && <Trend value={growthQty} digits={1} className="text-xs" />}</div>
              <div><p className="text-xs text-slate-500">Value</p><p className="text-xl font-black sm:text-2xl">{rpf(value)}</p>{growthValue !== undefined && <Trend value={growthValue} digits={1} className="text-xs" />}</div>
            </div>
            <div className="sd-table-wrap mt-4">
              <table className="sd-table">
                <thead><tr><th>LOB</th><th className="n">Qty</th><th className="n">Value</th></tr></thead>
                <tbody>
                  {APPLE_LOBS.map((k) => (
                    <tr key={k}>
                      <td className="font-bold">{k}</td>
                      <td className="n">{num(lob[k])}{lobPrev && <div><Trend value={lobPrev[k] ? ((lob[k] - lobPrev[k]) / lobPrev[k]) * 100 : null} digits={1} className="text-[11px]" /></div>}</td>
                      <td className="n">{rpf(lobV[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MonthTable({ year, prevYear, cur, prev, upTo, deviceOnly = false }: { year: string; prevYear: string; cur: Map<string, SalesLine[]>; prev: Map<string, SalesLine[]>; upTo: string; deviceOnly?: boolean }) {
  const pick = (lines?: SalesLine[]) => (lines ? totals(deviceOnly ? lines.filter((l) => l.type === "DEVICES") : lines) : null);
  const dash = <span className="text-slate-400">—</span>;
  let anyPartial = false;
  const rows = MONTH_NUMS.map((n) => {
    const pm = `${prevYear}-${n}`;
    const cm = `${year}-${n}`;
    const curLines = n <= upTo ? cur.get(cm) : undefined;
    const fair = sameRange(cm, pm, curLines, prev.get(pm));
    if (fair.upTo) anyPartial = true;
    return { n, a: pick(prev.get(pm)), b: pick(curLines), fa: pick(fair.prev), fb: pick(fair.cur), upTo: fair.upTo };
  }).filter((r) => r.a || r.b); // a month with no data in either year is just a row of dashes
  if (!rows.length) return <p className="text-sm text-slate-500">Belum ada data bulan apa pun untuk {prevYear} maupun {year}.</p>;
  return (
    <>
      <div className="sd-table-wrap">
        <table className="sd-table">
          <thead>
            <tr><th>Bulan</th><th className="n">{prevYear} Qty</th><th className="n">{prevYear} Value</th><th className="n">{year} Qty</th><th className="n">{year} Value</th><th className="n">Selisih Value</th><th className="n">Growth</th></tr>
          </thead>
          <tbody>
            {rows.map(({ n, a, b, fa, fb, upTo: d }) => (
              <tr key={n}>
                <td className="font-bold">
                  {monthShort(`${year}-${n}`).split(" ")[0]}
                  {d && <span className="block text-[11px] font-semibold text-amber-600">tgl 1–{d}</span>}
                </td>
                <td className="n">{a ? num(a.qty) : dash}{d && fa && <div className="text-[11px] text-slate-400">1–{d}: {num(fa.qty)}</div>}</td>
                <td className="n">{a ? rpf(a.sales) : dash}{d && fa && <div className="text-[11px] text-slate-400">1–{d}: {rpf(fa.sales)}</div>}</td>
                <td className="n">{b ? num(b.qty) : dash}</td>
                <td className="n">{b ? rpf(b.sales) : dash}{d && b && <div className="text-[11px] font-semibold text-amber-600">s/d tgl {d}</div>}</td>
                <td className="n">{fa && fb ? rpf(fb.sales - fa.sales) : dash}</td>
                <td className="n">{fa && fb ? <Trend value={fa.sales ? ((fb.sales - fa.sales) / fa.sales) * 100 : null} digits={1} /> : dash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {anyPartial && <p className="mt-2 text-xs text-slate-500">Bulan bertanda <b className="text-amber-600">tgl 1–N</b> datanya belum sebulan penuh (bulan berjalan, atau file yang di-upload berhenti di tengah bulan). Selisih & growth bulan itu dibanding tahun lalu pada tanggal yang sama; angka besar di kolom {prevYear} tetap total sebulan penuh.</p>}
    </>
  );
}

async function Compare({ snap, months }: { snap: MonthSnapshot; months: MonthEntry[] }) {
  const year = snap.month.slice(0, 4);
  const prevYear = String(Number(year) - 1);
  const cur = await loadYear(months, year, `${year}-12`);
  const prev = await loadYear(months, prevYear, `${prevYear}-12`);
  const lyMonth = sameMonthLastYear(snap.month);
  const ly = prev.get(lyMonth) ?? null;
  return (
    <>
    {ly && <YoyDetail snap={snap} ly={ly} lyMonth={lyMonth} />}
    <Panel title={`Compare ${prevYear} vs ${year}`} desc="Perbandingan bulanan Qty, Value, Selisih, dan Growth." right={prev.size === 0 ? <NeedData label={`Need Data ${prevYear}`} /> : undefined}>
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-black text-slate-700">All Sales</p>
          <MonthTable year={year} prevYear={prevYear} cur={cur} prev={prev} upTo="12" />
        </div>
        <div>
          <p className="mb-2 text-sm font-black text-slate-700">Device Only</p>
          <MonthTable year={year} prevYear={prevYear} cur={cur} prev={prev} upTo="12" deviceOnly />
        </div>
      </div>
      {prev.size === 0 && <p className="mt-3 text-xs text-slate-500">Data {prevYear} belum ada di aplikasi. Upload Merchandise Report {prevYear} per bulan di Data Upload → Import Data Penjualan agar kolom {prevYear} terisi.</p>}
    </Panel>
    </>
  );
}

type YoyRow = { label: string; a: { v: number; q: number }; b: { v: number; q: number }; full: number; strong?: boolean; note?: string };

/**
 * This month vs the same month last year, same day range (1 → last data day), per group, Apple LOB
 * and Android brand. Last year's full-month value is shown as the bar to beat.
 */
function YoyDetail({ snap, ly, lyMonth }: { snap: MonthSnapshot; ly: SalesLine[]; lyMonth: string }) {
  const day = (snap.lastDataDate ?? `${snap.month}-31`).slice(8);
  const lyRange = ly.filter((l) => l.date.slice(8) <= day);
  const cur = snap.lines;
  const sum = (ls: SalesLine[], f: (l: SalesLine) => boolean) => ls.filter(f).reduce((a, l) => ({ v: a.v + l.amount, q: a.q + (l.countsInQty ? l.qty : 0) }), { v: 0, q: 0 });
  const row = (label: string, f: (l: SalesLine) => boolean, extra: Partial<YoyRow> = {}): YoyRow => ({ label, a: sum(lyRange, f), b: sum(cur, f), full: sum(ly, f).v, ...extra });
  const groups: YoyRow[] = [
    row("Total", () => true, { strong: true }),
    row("Apple", (l) => l.group === "Apple"),
    row("Android", (l) => l.group === "Android"),
    row("Accessories", (l) => l.group === "ACC"),
    row("VAS", (l) => l.group === "VAS"),
  ];
  const apple: YoyRow[] = APPLE_LOBS.map((k) => row(APPLE_LABELS[k], (l) => l.lob === k, k === "AirPods" ? { note: "ACC" } : {}));
  const brands = [...new Set([...lyRange, ...cur].filter((l) => l.group === "Android").map((l) => l.lob ?? "Lainnya"))];
  const android: YoyRow[] = brands
    .map((b) => row(b, (l) => l.group === "Android" && (l.lob ?? "Lainnya") === b))
    .sort((x, y) => y.a.v + y.b.v - (x.a.v + x.b.v));
  const lyLabel = monthShort(lyMonth);
  const nowLabel = monthShort(snap.month);
  const Table = ({ title, rows }: { title: string; rows: YoyRow[] }) => (
    <div>
      <p className="mb-2 text-sm font-black text-slate-700">{title}</p>
      <div className="sd-table-wrap">
        <table className="sd-table sd-table-compact">
          <thead>
            <tr><th>{title === "Per Grup" ? "Grup" : title === "Apple per LOB" ? "LOB" : "Brand"}</th><th className="n">{lyLabel}</th><th className="n">{nowLabel}</th><th className="n max-sm:hidden">Growth</th><th className="n max-sm:hidden">Full {lyLabel}</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={r.strong ? "font-black" : undefined}>
                <td className="font-bold">{r.label}{r.note && <span className="ml-1 text-[11px] font-semibold text-slate-400">({r.note})</span>}</td>
                <td className="n">{rpc(r.a.v)}<div className="text-[11px] font-normal text-slate-400">{num(r.a.q)} unit</div></td>
                <td className="n">
                  {rpc(r.b.v)}
                  <div className="text-[11px] font-normal text-slate-400">{num(r.b.q)} unit</div>
                  {r.a.v ? <div className="sm:hidden"><Trend value={((r.b.v - r.a.v) / Math.abs(r.a.v)) * 100} digits={1} className="text-[11px]" /></div> : null}
                </td>
                <td className="n max-sm:hidden">{r.a.v ? <Trend value={((r.b.v - r.a.v) / Math.abs(r.a.v)) * 100} digits={1} /> : <span className="text-slate-400">—</span>}</td>
                <td className="n max-sm:hidden">{rpc(r.full)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <Panel title={`${nowLabel} vs ${lyLabel}`} desc={`Periode sama: tanggal 1–${Number(day)}. Growth = value ${nowLabel} dibanding ${lyLabel} pada tanggal yang sama. "Full ${lyLabel}" = total sebulan penuh tahun lalu.`}>
      <div className="space-y-6">
        <Table title="Per Grup" rows={groups} />
        <Table title="Apple per LOB" rows={apple} />
        {android.length > 0 && <Table title="Android per Brand" rows={android} />}
      </div>
    </Panel>
  );
}
