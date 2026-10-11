import Link from "next/link";
import { appConfig } from "@/config/app";
import { EmptyBlock, NeedData, Panel, Progress, SectionHead, Trend, achColor } from "@/components/kit";
import { CopyButton, LineChart, ParamSelect, PrintButton, WhatsAppButton } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { APPLE_LOBS, linesIn, lobQty, lobValue, perfCards, staffStats, timeGonePct } from "@/lib/domain/extra";
import { totals } from "@/lib/domain/kpi";
import { sameMonthLastYear } from "@/lib/domain/period";
import { shareText } from "@/lib/domain/share";
import { homeView } from "@/lib/domain/views";
import { dec, monthLabel, monthShort, num, pct, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";
import { getMonthSnapshot, type MonthSnapshot } from "@/lib/services/dashboard";
import type { MonthEntry } from "@/lib/repositories";

const TONES = ["blue", "violet", "green", "amber"] as const;

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Overview" p={p} />;
  const tab = p.q.tab === "ytd" || p.q.tab === "compare" ? p.q.tab : "monthly";
  const tabs = [
    { key: "monthly", label: "Overview Bulanan" },
    { key: "ytd", label: "YTD Overview" },
    { key: "compare", label: `Compare ${Number(p.month.slice(0, 4)) - 1} vs ${p.month.slice(0, 4)}` },
  ];
  return (
    <div className="sd-content">
      <nav className="sd-tabs grid-cols-3" aria-label="Tampilan overview">
        {tabs.map((t) => (
          <Link key={t.key} href={withQuery("/home", p.q, { tab: t.key === "monthly" ? null : t.key })} className="sd-tab" aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "monthly" && <Monthly p={p} />}
      {tab === "ytd" && <Ytd snap={p.snap} months={p.months} />}
      {tab === "compare" && <Compare snap={p.snap} months={p.months} />}
    </div>
  );
}

type Ok = Extract<Awaited<ReturnType<typeof loadPage>>, { state: "ok" }>;

async function Monthly({ p }: { p: Ok }) {
  const h = homeView(p.snap, p.asOf);
  const tg = timeGonePct(p.month, p.asOf);
  const cards = perfCards(h);
  const mtd = linesIn(p.snap, `${p.month}-01`, p.asOf);
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c, i) => (
            <article key={c.key} className="sd-block-card p-5" data-tone={TONES[i]}>
              <p className="text-xs font-black tracking-[.08em] text-slate-500 uppercase">{c.label}</p>
              <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{rpf(c.actual)}</p>
              <div className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-[13px] dark:border-slate-700">
                <div className="flex justify-between gap-2"><span className="text-slate-500">Target {rpf(c.target)}</span><b className={c.achievementPct != null && c.achievementPct < tg ? "text-rose-600" : "text-slate-900"}>{c.achievementPct == null ? "▲ 0%" : `${c.achievementPct >= tg ? "▲" : "▼"} ${pct(c.achievementPct, 0)}`}</b></div>
                <div className="flex justify-between gap-2"><span className="font-semibold whitespace-nowrap text-blue-600">Est. {rpf(c.estimate)}</span><b className="whitespace-nowrap text-slate-900">{dec(c.points, 1).replace(",0", "")}/{c.pointsMax} pts</b></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Variance</span><b className={c.variance <= 0 ? "text-emerald-600" : "text-rose-600"}>{rpf(c.variance)}</b></div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <Panel title="Month Progress" desc="Progress target dan produktivitas transaksi." right={noTarget ? <span className="sd-badge red">Target belum ada</span> : <span className={`sd-badge ${(h.achievement.achievementPct ?? 0) >= tg ? "green" : "red"}`}>{(h.achievement.achievementPct ?? 0) >= tg ? "On Track" : "Behind"}</span>}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
          <Kv label="Target" value={rpf(h.achievement.target)} />
          <Kv label="Achievement" value={<>{rpf(h.totals.sales)} • <span className={(h.achievement.achievementPct ?? 0) >= tg ? "text-emerald-600" : "text-rose-600"}>{(h.achievement.achievementPct ?? 0) >= tg ? "▲" : "▼"} {pct(h.achievement.achievementPct ?? 0, 0)}</span></>} />
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
              <tr><th>Grup</th><th className="n">Actual</th><th className="n">Target</th><th style={{ minWidth: 160 }}>Ach</th><th className="n">Time Gone</th><th className="n">Gap</th><th className="n">Estimasi</th><th className="n">Qty</th><th className="n">Point</th></tr>
            </thead>
            <tbody>
              {h.groups.map((g) => (
                <tr key={g.group}>
                  <td className="font-bold">{g.group}</td>
                  <td className="n">{rpf(g.actual)}</td>
                  <td className="n">{rpf(g.target)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><Progress value={g.achievementPct} tick={tg} color={achColor(g.achievementPct, tg)} label={`Pencapaian ${g.group}`} /></div>
                      <b className="w-12 text-right text-xs">{pct(g.achievementPct, 0)}</b>
                    </div>
                  </td>
                  <td className="n">{pct(tg)}</td>
                  <td className={`n font-semibold ${g.gap >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{rpf(g.gap)}</td>
                  <td className="n">{rpf(g.estimate)} <span className="text-xs text-slate-500">{pct(g.estimatePct, 0)}</span></td>
                  <td className="n">{num(g.qty)}</td>
                  <td className="n">{dec(g.point, 1)} <span className="text-xs text-slate-500">/ {g.pointCap}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="n">{rpf(h.totals.sales)}</td>
                <td className="n">{rpf(h.achievement.target)}</td>
                <td>{pct(h.achievement.achievementPct, 0)}</td>
                <td className="n">{pct(tg)}</td>
                <td className="n">{rpf(h.achievement.gap)}</td>
                <td className="n">{rpf(h.estimate)}</td>
                <td className="n">{num(h.totals.qty)}</td>
                <td className="n">{dec(h.points.total, 1)} / {h.points.max}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Time gone = tanggal data terupdate ÷ jumlah hari bulan ini × 100. AirPods dihitung di ACC.</p>
      </Panel>

      <Panel title="Team Performance">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Mini label="Total Staff" value={num(people.length)} />
          <Mini label="Productive" value={num(productive.length)} />
          <Mini label="Need Push" value={num(needPush.length)} />
          <Mini label="Total Transaction" value={num(h.totals.invoices)} />
          <Mini label="Avg UPT" value={dec(avgUpt, 1).replace(",", ".")} />
          <Mini label="Avg ATV" value={rpf(h.totals.atv)} />
        </div>
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
              <tr><th>Staff</th><th className="n">Sales</th><th className="n">Trx</th><th className="n">Device</th><th className="n">Accessories</th><th className="n">VAS</th><th className="n">UPT</th><th className="n">ATV</th><th>Status</th></tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.key}>
                  <td className="font-bold text-slate-950">{s.name}{s.isChannel && <span className="ml-2 text-xs font-semibold text-slate-400">online</span>}</td>
                  <td className="n">{rpf(s.totals.sales)}</td>
                  <td className="n">{num(s.totals.invoices)}</td>
                  <td className="n">{rpf(s.device)}</td>
                  <td className="n">{rpf(s.acc)}</td>
                  <td className="n">{rpf(s.vas)}</td>
                  <td className="n">{dec(s.totals.upt, 1).replace(",", ".")}</td>
                  <td className="n">{rpf(s.totals.atv)}</td>
                  <td>{s.isChannel ? <span className="sd-badge slate">Online</span> : <span className={`sd-badge ${s.status === "Productive" ? "green" : "red"}`}>{s.status}</span>}</td>
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
        {!lfl && <p className="mt-3 text-xs text-slate-500">Daftarkan file {monthLabel(sameMonthLastYear(p.month))} di Settings untuk mengaktifkan LFL (periode yang sama, tanggal 1–{Number(p.asOf.slice(8))}).</p>}
      </Panel>

      <Panel title="Share Daily" desc="Ringkasan harian untuk WhatsApp." right={<div className="flex gap-2"><CopyButton text={shareText(h, cfg.storeName)} label="Salin teks" /><WhatsAppButton text={shareText(h, cfg.storeName)} /></div>}>
        <pre className="m-0 rounded-2xl bg-slate-50 p-4 font-[inherit] text-sm whitespace-pre-wrap text-slate-700">{shareText(h, cfg.storeName)}</pre>
      </Panel>
    </>
  );
}

function Kv({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-3.5 dark:border-slate-700">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

/** Same month last year, same day range — only when that month is registered. */
async function lastYear(months: MonthEntry[], month: string, asOf: string) {
  const ly = sameMonthLastYear(month);
  if (!months.some((m) => m.month === ly)) return null;
  try {
    const s = await getMonthSnapshot(ly);
    const day = asOf.slice(8);
    return totals(s.lines.filter((l) => l.date.slice(8) <= day));
  } catch {
    return null;
  }
}

/* ---------------- YTD ---------------- */

async function loadYear(months: MonthEntry[], year: string, upTo: string): Promise<Map<string, MonthSnapshot>> {
  const out = new Map<string, MonthSnapshot>();
  const list = months.filter((m) => m.month.startsWith(year) && m.month <= upTo);
  await Promise.all(
    list.map(async (m) => {
      try {
        out.set(m.month, await getMonthSnapshot(m.month));
      } catch {}
    }),
  );
  return out;
}

const MONTH_NUMS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

async function Ytd({ snap, months }: { snap: MonthSnapshot; months: MonthEntry[] }) {
  const year = snap.month.slice(0, 4);
  const prevYear = String(Number(year) - 1);
  const mm = snap.month.slice(5);
  const cur = await loadYear(months, year, snap.month);
  const prev = await loadYear(months, prevYear, `${prevYear}-${mm}`);
  const all = (m: Map<string, MonthSnapshot>) => [...m.values()].flatMap((s) => s.lines);
  const curLines = all(cur);
  const prevLines = all(prev);
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
      <Panel title={`YTD ${prevYear} vs ${year}`} desc={`Januari – ${monthLabel(snap.month).split(" ")[0]}. Hanya bulan yang sudah didaftarkan di Settings yang dihitung.`}>
        {missingCur > 0 && <p className="mb-4 text-sm text-amber-700">{missingCur} bulan {year} belum didaftarkan — nilai YTD hanya dari bulan yang terdaftar.</p>}
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
          <EmptyBlock title={`Data ${year}`}>Daftarkan file bulanan {year} di Settings untuk perbandingan YTD.</EmptyBlock>
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

function MonthTable({ year, prevYear, cur, prev, upTo, deviceOnly = false }: { year: string; prevYear: string; cur: Map<string, MonthSnapshot>; prev: Map<string, MonthSnapshot>; upTo: string; deviceOnly?: boolean }) {
  const pick = (s?: MonthSnapshot) => {
    if (!s) return null;
    const ls = deviceOnly ? s.lines.filter((l) => l.type === "DEVICES") : s.lines;
    return totals(ls);
  };
  return (
    <div className="sd-table-wrap">
      <table className="sd-table">
        <thead>
          <tr><th>Bulan</th><th className="n">{prevYear} Qty</th><th className="n">{prevYear} Value</th><th className="n">{year} Qty</th><th className="n">{year} Value</th><th className="n">Selisih Value</th><th className="n">Growth</th></tr>
        </thead>
        <tbody>
          {MONTH_NUMS.map((n) => {
            const a = pick(prev.get(`${prevYear}-${n}`));
            const b = n <= upTo ? pick(cur.get(`${year}-${n}`)) : null;
            return (
              <tr key={n}>
                <td className="font-bold">{monthShort(`${year}-${n}`).split(" ")[0]}</td>
                <td className="n">{a ? num(a.qty) : <span className="text-slate-400">—</span>}</td>
                <td className="n">{a ? rpf(a.sales) : <span className="text-slate-400">—</span>}</td>
                <td className="n">{b ? num(b.qty) : <span className="text-slate-400">—</span>}</td>
                <td className="n">{b ? rpf(b.sales) : <span className="text-slate-400">—</span>}</td>
                <td className="n">{a && b ? rpf(b.sales - a.sales) : <span className="text-slate-400">—</span>}</td>
                <td className="n">{a && b ? <Trend value={a.sales ? ((b.sales - a.sales) / a.sales) * 100 : null} digits={1} /> : <span className="text-slate-400">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function Compare({ snap, months }: { snap: MonthSnapshot; months: MonthEntry[] }) {
  const year = snap.month.slice(0, 4);
  const prevYear = String(Number(year) - 1);
  const cur = await loadYear(months, year, `${year}-12`);
  const prev = await loadYear(months, prevYear, `${prevYear}-12`);
  return (
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
      {prev.size === 0 && <p className="mt-3 text-xs text-slate-500">Data {prevYear} belum ada di aplikasi. Daftarkan file bulanan {prevYear} di Settings (satu file per bulan) agar kolom {prevYear} terisi.</p>}
    </Panel>
  );
}
