import type { ReactNode } from "react";
import { PageIntro, Panel, Stat, Trend } from "@/components/kit";
import { MobileGrid } from "@/components/kit/MobileGrid";
import { ParamSelect } from "@/components/kit/controls";
import { JumpChips } from "@/components/modules/JumpChips";
import { PageStatus } from "@/components/layout/PageStatus";
import { nameKey } from "@/lib/domain/normalize";
import { prevMonth } from "@/lib/domain/period";
import { qoalaView, type QStats, type QStaffRow } from "@/lib/domain/qoala";
import { dayShort, monthLabel, num, pct, rpc, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { getMonthLines } from "@/lib/services/dashboard";
import type { StoreTarget } from "@/types/domain";

/** Minimum device units before a staff counts for "best AR" (avoids 1/1 = 100%). */
const MIN_DEV = 3;

const ar = (n: number | null) => (n == null ? "–" : pct(n, 0));

/** AR change in percentage points ("▲ 4,2 pp"). */
function Pp({ cur, prev }: { cur: number | null; prev: number | null | undefined }) {
  if (cur == null || prev == null) return <span className="font-bold text-slate-400">–</span>;
  const d = cur - prev;
  return <span className={`font-bold ${d >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{d >= 0 ? "▲" : "▼"} {Math.abs(d).toLocaleString("id-ID", { maximumFractionDigits: 1 })} pp</span>;
}

/** AR bar (0–100%) with last month's AR as a tick. */
function ArBar({ value, prev }: { value: number | null; prev?: number | null }) {
  const w = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="relative mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${w}%` }} />
      {prev != null && <div className="absolute -top-1 h-4 w-0.5 bg-slate-700 dark:bg-slate-200" style={{ left: `${Math.max(0, Math.min(100, prev))}%` }} title={`Bulan lalu ${ar(prev)}`} />}
    </div>
  );
}

/** Qoala target from Target Store (VAS section, "Qoala" column), store and per staff. */
function qoalaTargets(t: StoreTarget | null) {
  const col = (o: Record<string, number> | undefined) => {
    if (!o) return 0;
    const k = Object.keys(o).find((x) => /qoala/i.test(x));
    return k ? o[k] : 0;
  };
  const store = col(t?.sections.VAS?.columnTargets);
  const staff = new Map((t?.staff ?? []).map((s) => [nameKey(s.name), col(s.byColumn)]));
  return { store, staff };
}

export default async function QoalaPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Qoala" p={p} />;
  const pm = prevMonth(p.month);
  const prev = await getMonthLines(pm, p.months).catch(() => null);
  const v = qoalaView(p.snap.lines, p.asOf, prev?.lines ?? null, p.snap.rules.channelNames);
  const day = Number(p.asOf.slice(8, 10));
  const period = `1–${day} ${monthLabel(p.month)}`;
  const prevPeriod = `1–${day} ${monthLabel(pm)}`;
  const tg = qoalaTargets(p.snap.target);
  const c = v.cur;
  const pv = v.prev;
  const staff = v.staff.filter((s) => !s.online);
  const online = v.staff.find((s) => s.online);
  const missed = v.missed.filter((m) => m.staff !== "Online");

  // "jagoan": best value, best AR on Apple / Android (with enough devices), most missed
  const best = (f: (s: QStaffRow) => number | null, min: (s: QStaffRow) => boolean) =>
    staff.filter(min).sort((a, b) => (f(b) ?? -1) - (f(a) ?? -1))[0];
  const topValue = staff[0];
  const topApple = best((s) => s.cur.arApple, (s) => s.cur.devApple >= MIN_DEV && (s.cur.arApple ?? 0) > 0);
  const topAndroid = best((s) => s.cur.arAndroid, (s) => s.cur.devAndroid >= MIN_DEV && (s.cur.arAndroid ?? 0) > 0);
  const mostMissed = [...staff].sort((a, b) => b.cur.missed - a.cur.missed)[0];

  return (
    <div className="sd-content">
      <PageIntro title="Qoala" desc={`Device (tanpa watch) vs polis Qoala, AR per staff & per hari. Dibanding ${prevPeriod}.`} />
      <section className="sd-panel grid gap-3 p-5 sm:grid-cols-3">
        <ParamSelect param="m" label="Bulan" value={p.month} reset={["d"]} options={p.months.map((m) => ({ value: m.month, label: monthLabel(m.month) }))} />
        <div className="self-end text-sm text-slate-500 sm:col-span-2">
          Periode <b className="text-slate-800 dark:text-slate-100">{period}</b> · AR = polis Qoala ÷ unit device (iPhone, iPad, Mac, HP & tablet Android; <b>watch tidak dihitung</b>).
          {!prev && <span className="text-amber-700"> Data bulan lalu belum ada.</span>}
        </div>
      </section>

      <JumpChips items={[{ id: "ringkasan", label: "Ringkasan" }, { id: "ranking", label: "Ranking Staff" }, { id: "harian", label: "Rekap Harian" }, { id: "staff-harian", label: "Detail Staff" }, { id: "terlewat", label: "Peluang Terlewat" }]} />

      <div id="ringkasan" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat tone="violet" label="Value Qoala" value={rpc(c.value)} sub={<><Trend value={pv?.value ? (c.value / pv.value - 1) * 100 : null} /> vs {rpc(pv?.value ?? null)}{tg.store ? <> · target {rpc(tg.store)} (<b>{pct((c.value / tg.store) * 100, 0)}</b>)</> : null}</>} />
        <Stat tone="blue" label="Polis Qoala" value={num(c.q)} sub={<><Trend value={pv?.q ? (c.q / pv.q - 1) * 100 : null} /> vs {num(pv?.q ?? null)}</>} />
        <Stat tone="green" label="AR Qoala" value={ar(c.ar)} sub={<><Pp cur={c.ar} prev={pv?.ar} /> vs {ar(pv?.ar ?? null)}</>} />
        <Stat label="Device (tanpa watch)" value={num(c.dev)} sub={<>Apple {num(c.devApple)} · Android {num(c.devAndroid)}</>} />
        <Stat tone="amber" label="Rata-rata / polis" value={rpc(v.avgPolicy)} sub={<>bulan lalu {rpc(v.prevAvgPolicy)}</>} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(["Apple", "Android"] as const).map((g) => {
          const dev = g === "Apple" ? c.devApple : c.devAndroid;
          const q = g === "Apple" ? c.qApple : c.qAndroid;
          const a = g === "Apple" ? c.arApple : c.arAndroid;
          const pa = g === "Apple" ? pv?.arApple : pv?.arAndroid;
          const pq = g === "Apple" ? pv?.qApple : pv?.qAndroid;
          return (
            <div key={g} className="sd-panel p-5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-black text-slate-900 dark:text-white">{g}</p>
                <p className="text-2xl font-black tabular-nums">{ar(a)}</p>
              </div>
              <ArBar value={a} prev={pa} />
              <p className="mt-2 text-[13px] text-slate-500 tabular-nums">
                {num(q)} polis dari {num(dev)} device · bulan lalu {num(pq ?? null)} polis, AR {ar(pa ?? null)} <Pp cur={a} prev={pa} />
              </p>
            </div>
          );
        })}
      </div>
      {c.qOther > 0 && <p className="-mt-2 text-xs text-slate-500">{num(c.qOther)} polis tercatat di invoice tanpa device (beli terpisah) — masuk total, tidak masuk Apple/Android.</p>}

      {staff.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Hero label="Value tertinggi" name={topValue?.name} value={rpc(topValue?.cur.value ?? null)} sub={`${num(topValue?.cur.q ?? 0)} polis · AR ${ar(topValue?.cur.ar ?? null)}`} />
          <Hero label="Jago Apple" name={topApple?.name} value={ar(topApple?.cur.arApple ?? null)} sub={topApple ? `${num(topApple.cur.qApple)} polis dari ${num(topApple.cur.devApple)} device Apple` : `belum ada (min. ${MIN_DEV} device)`} />
          <Hero label="Jago Android" name={topAndroid?.name} value={ar(topAndroid?.cur.arAndroid ?? null)} sub={topAndroid ? `${num(topAndroid.cur.qAndroid)} polis dari ${num(topAndroid.cur.devAndroid)} device Android` : `belum ada (min. ${MIN_DEV} device)`} />
          <Hero label="Paling banyak terlewat" name={mostMissed?.cur.missed ? mostMissed.name : undefined} value={mostMissed?.cur.missed ? `${num(mostMissed.cur.missed)} unit` : "–"} sub="device tanpa Qoala di invoice" tone="rose" />
        </div>
      )}

      <Panel id="ranking" title="Ranking Staff" desc={`Urut value Qoala tertinggi · ${period} vs ${prevPeriod}.`}>
        <MobileGrid
          cols={[{ label: "Staff" }, { label: "Value", w: "4.6rem" }, { label: "Polis", w: "2.4rem" }, { label: "AR", w: "2.8rem" }]}
          rows={v.staff.map((s, i) => ({
            key: s.key,
            cells: [<b key="n" className="leading-tight">{s.online ? "" : `${i + 1}. `}{s.name}</b>, <b key="v">{rpc(s.cur.value)}</b>, num(s.cur.q), <b key="a">{ar(s.cur.ar)}</b>],
            sub: (
              <>
                Apple {num(s.cur.qApple)}/{num(s.cur.devApple)} ({ar(s.cur.arApple)}) · Android {num(s.cur.qAndroid)}/{num(s.cur.devAndroid)} ({ar(s.cur.arAndroid)}) · terlewat {num(s.cur.missed)} · <Trend value={s.growth} /> MTM
              </>
            ),
          }))}
          foot={["TOTAL", rpc(c.value), num(c.q), ar(c.ar)]}
        />
        <div className="sd-table-wrap max-sm:hidden">
          <table className="sd-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Staff</th>
                <th className="n">Value Qoala</th>
                {tg.store > 0 && <th className="n">% Target</th>}
                <th className="n">vs Bln Lalu</th>
                <th className="n">Polis</th>
                <th className="n">Device</th>
                <th className="n">AR</th>
                <th className="n">AR Bln Lalu</th>
                <th className="n">Apple</th>
                <th className="n">Android</th>
                <th className="n">Terlewat</th>
              </tr>
            </thead>
            <tbody>
              {v.staff.map((s, i) => {
                const t = tg.staff.get(s.key) ?? 0;
                return (
                  <tr key={s.key}>
                    <td className="text-slate-400">{s.online ? "" : i + 1}</td>
                    <td className="font-bold">{s.name}</td>
                    <td className="n font-bold">{rpf(s.cur.value)}</td>
                    {tg.store > 0 && <td className="n">{t ? pct((s.cur.value / t) * 100, 0) : "–"}</td>}
                    <td className="n"><Trend value={s.growth} /></td>
                    <td className="n">{num(s.cur.q)}</td>
                    <td className="n">{num(s.cur.dev)}</td>
                    <td className="n font-black">{ar(s.cur.ar)}</td>
                    <td className="n text-slate-500">{ar(s.prev?.ar ?? null)} <Pp cur={s.cur.ar} prev={s.prev?.ar} /></td>
                    <td className="n"><Split q={s.cur.qApple} dev={s.cur.devApple} ar={s.cur.arApple} /></td>
                    <td className="n"><Split q={s.cur.qAndroid} dev={s.cur.devAndroid} ar={s.cur.arAndroid} /></td>
                    <td className={`n ${s.cur.missed ? "font-bold text-rose-600" : "text-slate-400"}`}>{num(s.cur.missed)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td>TOTAL</td>
                <td className="n">{rpf(c.value)}</td>
                {tg.store > 0 && <td className="n">{pct((c.value / tg.store) * 100, 0)}</td>}
                <td className="n"><Trend value={pv?.value ? (c.value / pv.value - 1) * 100 : null} /></td>
                <td className="n">{num(c.q)}</td>
                <td className="n">{num(c.dev)}</td>
                <td className="n">{ar(c.ar)}</td>
                <td className="n">{ar(pv?.ar ?? null)}</td>
                <td className="n"><Split q={c.qApple} dev={c.devApple} ar={c.arApple} /></td>
                <td className="n"><Split q={c.qAndroid} dev={c.devAndroid} ar={c.arAndroid} /></td>
                <td className="n">{num(c.missed)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500 max-sm:hidden">Apple/Android = polis/device (AR). Polis dihubungkan ke device lewat nomor invoice.</p>
        {online && <p className="mt-1 text-xs text-slate-500">Online ikut di total, tidak diberi ranking.</p>}
      </Panel>

      <Panel id="harian" title="Rekap Harian" desc={`Ketuk tanggal untuk rincian per staff · pembanding = tanggal yang sama ${monthLabel(pm)}.`}>
        <div className="hidden grid-cols-[6.5rem_repeat(6,minmax(0,1fr))] gap-2 px-3 pb-2 text-[11px] font-extrabold tracking-wide text-slate-500 uppercase sm:grid">
          <span>Tanggal</span><span className="text-right">Device A/An</span><span className="text-right">Polis</span><span className="text-right">AR</span><span className="text-right">Value</span><span className="text-right">Bln lalu</span><span className="text-right">AR bln lalu</span>
        </div>
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {v.days.map((d) => (
            <details key={d.date} className="group">
              <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 text-[13px] tabular-nums hover:bg-slate-50 sm:grid-cols-[6.5rem_repeat(6,minmax(0,1fr))] dark:hover:bg-slate-800/40">
                <span className="font-bold"><span className="mr-1 inline-block text-slate-400 transition group-open:rotate-90">›</span>{dayShort(d.date)}</span>
                <span className="text-right max-sm:hidden">{num(d.s.devApple)}/{num(d.s.devAndroid)}</span>
                <span className="text-right sm:font-normal"><b className="sm:font-normal">{num(d.s.q)}</b><span className="text-slate-400 sm:hidden">/{num(d.s.dev)}</span></span>
                <span className="text-right font-black">{ar(d.s.ar)}</span>
                <span className="text-right font-bold max-sm:col-span-2 max-sm:text-left max-sm:text-[12px] max-sm:font-semibold max-sm:text-slate-500">{rpc(d.s.value)}<span className="sm:hidden"> · bln lalu {rpc(d.prev?.value ?? null)} · AR {ar(d.prev?.ar ?? null)}</span></span>
                <span className="text-right text-slate-500 max-sm:hidden">{rpc(d.prev?.value ?? null)}</span>
                <span className="text-right text-slate-500 max-sm:hidden">{ar(d.prev?.ar ?? null)} <Pp cur={d.s.ar} prev={d.prev?.ar} /></span>
              </summary>
              <div className="bg-slate-50/70 px-3 py-2 dark:bg-slate-800/30">
                <StaffTable rows={d.staff.map((x) => ({ key: x.name, label: x.name, s: x.s }))} />
              </div>
            </details>
          ))}
          {!v.days.length && <p className="p-6 text-center text-sm text-slate-500">Belum ada penjualan device / Qoala bulan ini.</p>}
        </div>
      </Panel>

      <Panel id="staff-harian" title="Detail Harian per Staff" desc="Ketuk nama untuk melihat device, polis & AR per hari.">
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {v.staff.map((s) => (
            <details key={s.key} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <b><span className="mr-1 inline-block text-slate-400 transition group-open:rotate-90">›</span>{s.name}</b>
                <span className="text-right text-slate-500 tabular-nums">
                  <b className="text-slate-900 dark:text-white">{rpc(s.cur.value)}</b> · {num(s.cur.q)}/{num(s.cur.dev)} · AR <b className="text-slate-900 dark:text-white">{ar(s.cur.ar)}</b>
                </span>
              </summary>
              <div className="bg-slate-50/70 px-3 py-2 dark:bg-slate-800/30">
                <StaffTable first="Tanggal" rows={s.days.map((d) => ({ key: d.date, label: dayShort(d.date), s: d.s }))} />
              </div>
            </details>
          ))}
        </div>
      </Panel>

      <Panel id="terlewat" title="Peluang Terlewat" desc="Device (tanpa watch) dari staff toko yang invoice-nya tidak ada Qoala — urut harga tertinggi, bahan follow-up.">
        {missed.length ? (
          <>
            <ul className="divide-y divide-slate-200 text-[13px] dark:divide-slate-700">
              {missed.slice(0, 20).map((m, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold">{m.description}</span>
                    <span className="text-[11px] text-slate-500">{dayShort(m.date)} · {m.staff} · {m.group}</span>
                  </span>
                  <b className="shrink-0 tabular-nums">{rpc(m.amount)}</b>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">{num(missed.length)} device tanpa Qoala dari staff toko{missed.length > 20 ? " (20 teratas ditampilkan)" : ""}; penjualan online tidak dihitung di daftar ini.</p>
          </>
        ) : (
          <p className="text-sm text-slate-500">Semua device sudah ada Qoala-nya.</p>
        )}
      </Panel>
    </div>
  );
}

function Hero({ label, name, value, sub, tone }: { label: string; name?: string; value: ReactNode; sub: string; tone?: "rose" }) {
  return (
    <div className="sd-panel p-4">
      <p className={`text-[11px] font-black tracking-[.08em] uppercase ${tone === "rose" ? "text-rose-600" : "text-violet-600"}`}>{label}</p>
      <p className="mt-1 truncate text-base font-black text-slate-950 dark:text-white">{name ?? "–"}</p>
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="text-[12px] text-slate-500">{sub}</p>
    </div>
  );
}

function Split({ q, dev, ar: a }: { q: number; dev: number; ar: number | null }) {
  if (!dev && !q) return <span className="text-slate-400">–</span>;
  return (
    <span className="leading-tight">
      <b className="block">{ar(a)}</b>
      <span className="text-[11px] text-slate-500">{num(q)}/{num(dev)}</span>
    </span>
  );
}

/** Compact per-staff / per-day table inside a details panel (fits phones: 5 short columns). */
function StaffTable({ rows, first = "Staff" }: { rows: Array<{ key: string; label: string; s: QStats }>; first?: string }) {
  return (
    <table className="w-full text-[12px] tabular-nums">
      <thead>
        <tr className="text-left text-[10.5px] font-extrabold tracking-wide text-slate-500 uppercase">
          <th className="py-1 font-extrabold">{first}</th>
          <th className="py-1 text-right font-extrabold">Apple</th>
          <th className="py-1 text-right font-extrabold">Android</th>
          <th className="py-1 text-right font-extrabold">AR</th>
          <th className="py-1 text-right font-extrabold">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-slate-200 dark:border-slate-700">
            <td className="py-1.5 pr-2 font-semibold">{r.label}</td>
            <td className="py-1.5 text-right">{num(r.s.qApple)}/{num(r.s.devApple)}</td>
            <td className="py-1.5 text-right">{num(r.s.qAndroid)}/{num(r.s.devAndroid)}</td>
            <td className="py-1.5 text-right"><b>{ar(r.s.ar)}</b><span className="block text-[10.5px] text-slate-400">{num(r.s.q)}/{num(r.s.dev)}</span></td>
            <td className="py-1.5 text-right">{rpc(r.s.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
