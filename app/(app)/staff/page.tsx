import Link from "next/link";
import { PageIntro, Panel, Progress, achColor } from "@/components/kit";
import { JumpChips } from "@/components/modules/JumpChips";
import { ParamDate, ParamSelect } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { APPLE_LOBS, VAS_PROVIDERS, clampRange, linesByStaff, linesIn, lobQty, staffStats, timeGonePct } from "@/lib/domain/extra";
import { focusKey } from "@/lib/domain/views";
import { totals } from "@/lib/domain/kpi";
import { nameKey } from "@/lib/domain/normalize";
import { daysInMonth, eachDay, monthStart } from "@/lib/domain/period";
import { dec, monthLabel, num, pct, rpc, rpf } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";
import { GROUPS, type Group, type SalesLine } from "@/types/domain";

export default async function StaffPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Staff Performance" p={p} />;
  const s = p.snap;
  const range = p.q.range === "1";
  const { from, to } = range ? clampRange(p.month, p.asOf, p.q.from, p.q.to) : { from: monthStart(p.month), to: p.asOf };
  const dim = daysInMonth(p.month);
  const scale = range ? eachDay(from, to).length / dim : 1;
  const tg = range ? 100 : timeGonePct(p.month, p.asOf);
  const ls = linesIn(s, from, to);
  const all = staffStats(ls, s.target, tg, { targetScale: scale });
  const pick = p.q.staff && all.some((x) => x.key === p.q.staff) ? p.q.staff : "";
  const rows = pick ? all.filter((x) => x.key === pick) : all;
  const team = totals(ls);
  const teamTarget = (s.target?.total ?? 0) * scale;
  const teamAch = teamTarget ? (team.sales / teamTarget) * 100 : null;
  const onTrack = (teamAch ?? 0) >= tg;
const teamGapTg = team.sales - (teamTarget * tg) / 100;
  const byKey = linesByStaff(ls);

  // Detail per salesperson × item (Apple LOB · Android brand · VAS provider), same keys as Target Fokus;
  // staff target per item comes from that group's section of Target Store
  const staffTarget = (name: string) => s.target?.staff.find((x) => nameKey(x.name) === nameKey(name));
  type Col = { key: string; label: string; inTotal?: boolean };
  const table = (cols: Col[], keyOf: (l: SalesLine) => string | null, targetOf: (name: string, key: string) => number, qtyAll = false) => {
    const cell = (lines: SalesLine[], key: string) => {
      const m = lines.filter((l) => nameKey(keyOf(l) ?? "") === nameKey(key));
      return { value: m.reduce((a, l) => a + l.amount, 0), qty: m.reduce((a, l) => a + (qtyAll || l.countsInQty ? l.qty : 0), 0) };
    };
    const sum = (xs: Array<{ value: number; qty: number; target: number }>) => ({ value: xs.reduce((a, c) => a + c.value, 0), qty: xs.reduce((a, c) => a + c.qty, 0), target: xs.reduce((a, c) => a + c.target, 0) });
    const body = rows.map((r) => {
      const cells = cols.map((c) => ({ ...c, ...cell(byKey.get(r.key) ?? [], c.key), target: targetOf(r.name, c.key) }));
      return { r, cells, total: sum(cells.filter((c) => c.inTotal !== false)) };
    });
    const foot = cols.map((c, i) => ({ ...c, ...sum(body.map((b) => b.cells[i])) }));
    return { cols, body, foot, total: sum(foot.filter((c) => c.inTotal !== false)) };
  };
  // Detail per salesperson × item (Apple LOB · Android brand · VAS provider), same keys as Target Fokus;
  // staff target per item comes from that group's section of Target Store
  const breakdownOf = (group: Group, cols: Col[]) => {
    const tcols = s.target?.sections[group]?.columns ?? [];
    const targetOf = (name: string, key: string) => {
      const st = staffTarget(name);
      const col = tcols.find((c) => nameKey(c) === nameKey(key));
      return st && col ? (st.byColumn[`${group}:${col}`] ?? 0) * scale : 0;
    };
    return { ...table(cols, (l) => focusKey(group, l), targetOf, group === "VAS"), hasTarget: tcols.length > 0 };
  };
  const groupTable = { ...table(GROUPS.map((g) => ({ key: g, label: g })), (l) => l.group, (name, g) => (staffTarget(name)?.byGroup[g as Group] ?? 0) * scale), hasTarget: !!s.target?.staff.length };
  const vasTable = breakdownOf("VAS", VAS_PROVIDERS.map((k) => ({ key: k, label: k })));
  const appleTable = breakdownOf("Apple", [
    { key: "iPhone", label: "iPhone" },
    { key: "iPad", label: "iPad" },
    { key: "Mac", label: "MacBook" },
    { key: "Apple Watch", label: "Apple Watch" },
    // AirPods are sold by Apple staff but their value is ACC — shown, not added to Total Apple
    { key: "AirPods", label: "AirPods", inTotal: false },
  ]);
  // Android brands: every brand sold in the period (highest first), then brands that only have a target
  const androidSold = new Map<string, { label: string; value: number }>();
  for (const l of ls) {
    const k = focusKey("Android", l);
    if (!k) continue;
    const e = androidSold.get(nameKey(k)) ?? { label: k, value: 0 };
    e.value += l.amount;
    androidSold.set(nameKey(k), e);
  }
  const androidCols = [...androidSold.values()].filter((x) => x.value !== 0).sort((a, b) => b.value - a.value).map((x) => ({ key: x.label, label: x.label }));
  for (const c of s.target?.sections.Android?.columns ?? []) if (!androidCols.some((x) => nameKey(x.key) === nameKey(c))) androidCols.push({ key: c, label: c });
  const androidTable = breakdownOf("Android", androidCols);
  // TOTAL rows add up the staff shown (online channel accounts and the staff filter excluded), like the value tables
  const staffLines = rows.flatMap((r) => byKey.get(r.key) ?? []);
  // unit counts per Apple LOB and per Android brand (qty-counted lines only, as everywhere else)
  const qtyOf = (lines: SalesLine[]) => {
    const lob = lobQty(lines);
    const byBrand = new Map<string, number>();
    for (const l of lines) {
      const k = focusKey("Android", l);
      if (k && l.countsInQty) byBrand.set(nameKey(k), (byBrand.get(nameKey(k)) ?? 0) + l.qty);
    }
    const apple = APPLE_LOBS.reduce((a, k) => a + lob[k], 0);
    const android = [...byBrand.values()].reduce((a, n) => a + n, 0);
    return { lob, apple, android, device: apple + android, brand: (k: string) => byBrand.get(nameKey(k)) ?? 0 };
  };

  return (
    <div className="sd-content">
      <PageIntro title="Staff Performance" desc="Seluruh staff toko kecuali akun online (channel)." />
      <JumpChips
        items={[
          { id: "tabel-staff", label: "Staff Performance" },
          { id: "tabel-grup", label: "Per Grup" },
          { id: "tabel-apple", label: "Apple" },
          { id: "tabel-android", label: "Android" },
          { id: "tabel-vas", label: "VAS" },
          { id: "tabel-lob", label: "LOB (Qty)" },
        ]}
      />
      <section className="sd-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="font-black text-slate-950">Filter Range Penjualan Daily</p>
          <p className="text-sm text-slate-500">Aktifkan hanya saat ingin menarik pencapaian berdasarkan range tanggal.</p>
        </div>
        <Link href={withQuery("/staff", p.q, { range: range ? null : "1", from: null, to: null })} className={`sd-btn ${range ? "" : "primary"}`}>{range ? "Tutup Range" : "Buka Range"}</Link>
        {range && (
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <ParamDate param="from" label="Dari" value={from} min={monthStart(p.month)} max={p.asOf} />
            <ParamDate param="to" label="Sampai" value={to} min={monthStart(p.month)} max={p.asOf} />
          </div>
        )}
      </section>
      <section className="sd-panel grid gap-3 p-5 sm:grid-cols-2">
        <ParamSelect param="m" label="Bulan" value={p.month} reset={["d", "from", "to", "staff"]} options={p.months.map((m) => ({ value: m.month, label: monthLabel(m.month) }))} />
        <ParamSelect param="staff" label="Staff" value={pick} options={[{ value: "", label: "Semua Staff" }, ...all.map((x) => ({ value: x.key, label: x.name }))]} />
      </section>

      <section className="sd-panel p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <b className="text-slate-950">Team Sales {rpf(team.sales)} / Target {rpf(teamTarget)}</b>
          <span>Achievement {pct(teamAch ?? 0)}</span>
          <span>{range ? "Range" : "Monthly Pace"} {pct(tg)}</span>
          <span className={`sd-badge ${onTrack ? "green" : "red"}`}>● {onTrack ? "On Track" : "Behind"}</span>
          <span>Gap {rpf(team.sales - teamTarget)}</span>
<span className={`font-semibold ${teamGapTg >= 0 ? "text-emerald-600" : "text-rose-600"}`}>Gap TG {teamGapTg >= 0 ? "+" : ""}{rpf(teamGapTg)}</span>
        </div>
        <div className="mt-3"><Progress value={teamAch} tick={tg} color={achColor(teamAch, tg)} label="Achievement tim" /></div>
      </section>

      <Panel id="tabel-staff" title="Staff Performance" desc={range ? `Achievement value ${from} s/d ${to} (target dipro-rata ${eachDay(from, to).length} hari).` : "Achievement value bulanan."}>
        {/* phone: one card per staff, no sideways scrolling */}
        <div className="space-y-3 md:hidden">
          {rows.map((r) => (
            <div key={r.key} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-bold text-slate-950">{r.name}</p><p className="text-xs text-slate-400">{r.nik ?? "NIK tidak ada"}</p></div>
                <span className={`sd-badge shrink-0 ${r.target && r.onPace ? "green" : r.target ? "red" : "slate"}`}>● {r.target ? (r.onPace ? "On Track" : "Behind") : "No Target"}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <p className="text-lg font-black text-slate-950">{rpf(r.totals.sales)}</p>
                <p className="text-sm font-bold" style={{ color: achColor(r.achievementPct, tg) }}>{pct(r.achievementPct ?? 0, 0)}</p>
              </div>
              <p className="text-xs text-slate-500">Target {rpf(r.target)} · Gap <span className={r.gap > 0 ? "text-rose-600" : "text-emerald-600"}>{rpf(r.gap)}</span></p>
              <div className="mt-2"><Progress value={r.achievementPct} tick={tg} color={achColor(r.achievementPct, tg)} label={`Achievement ${r.name}`} /></div>
              <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 text-xs">
                <div><dt className="text-slate-400">Accessories</dt><dd className="font-semibold">{rpc(r.acc)}</dd></div>
                <div><dt className="text-slate-400">VAS</dt><dd className="font-semibold">{rpc(r.vas)}</dd></div>
                <div><dt className="text-slate-400">Trx</dt><dd className="font-semibold">{num(r.totals.invoices)}</dd></div>
                <div><dt className="text-slate-400">UPT</dt><dd className="font-semibold">{dec(r.totals.upt, 1).replace(",", ".")}</dd></div>
                <div className="col-span-2"><dt className="text-slate-400">ATV</dt><dd className="font-semibold">{rpf(r.totals.atv)}</dd></div>
              </dl>
            </div>
          ))}
        </div>
        <div className="sd-table-wrap hidden md:block">
          <table className="sd-table">
            <thead><tr><th>Nama</th><th className="n">Target</th><th className="n">Achievement</th><th className="n">%</th><th>Pace</th><th className="n">Gap</th><th className="n">Accessories</th><th className="n">VAS</th><th className="n">UPT</th><th className="n">ATV</th><th className="n">Trx</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td><p className="font-bold text-slate-950">{r.name}</p><p className="text-xs text-slate-400">{r.nik ?? "NIK tidak ada"}</p></td>
                  <td className="n">{rpf(r.target)}</td>
                  <td className="n font-black">{rpf(r.totals.sales)}</td>
                  <td className="n">{pct(r.achievementPct ?? 0, 0)}</td>
                  <td><span className={`sd-badge ${r.target && r.onPace ? "green" : r.target ? "red" : "slate"}`}>● {r.target ? (r.onPace ? "On Track" : "Behind") : "No Target"}</span></td>
                  <td className={`n ${r.gap > 0 ? "text-rose-600" : "text-emerald-600"}`}>{rpf(r.gap)}</td>
                  <td className="n">{rpf(r.acc)}</td>
                  <td className="n">{rpf(r.vas)}</td>
                  <td className="n">{dec(r.totals.upt, 1).replace(",", ".")}</td>
                  <td className="n">{rpf(r.totals.atv)}</td>
                  <td className="n">{num(r.totals.invoices)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Pace: On Track bila achievement ≥ time gone ({pct(tg)}). Gap = target − achievement. Jabatan staff (Cashier / Sales Assistant) butuh master staff — <b>Need Data</b>.</p>
      </Panel>

      <BreakdownPanel id="tabel-grup" title="Achievement per Grup" desc="Actual vs target staff per grup (Apple · Android · ACC · VAS)." data={groupTable} tg={tg} range={range} totalLabel="Total" />
      <BreakdownPanel id="tabel-apple" title="Achievement Apple" desc={`Value & qty Apple per salesperson per LOB${range ? ` (${from} s/d ${to}, target dipro-rata)` : ""}. Persen = achievement vs target staff per LOB dari Target Store.`} data={appleTable} tg={tg} range={range} note="AirPods dihitung di ACC — ditampilkan, tapi tidak masuk Total Apple." totalLabel="Total Apple" />
      <BreakdownPanel id="tabel-android" title="Detail Pencapaian Android" desc={`Value & qty Android per salesperson per brand${range ? ` (${from} s/d ${to}, target dipro-rata)` : ""}. Persen = achievement vs target staff per brand dari Target Store.`} data={androidTable} tg={tg} range={range} totalLabel="Total Android" />
      <BreakdownPanel id="tabel-vas" title="Pencapaian VAS" desc={`Value & qty VAS per salesperson per provider${range ? ` (${from} s/d ${to}, target dipro-rata)` : ""}. Persen = achievement vs target staff per provider dari Target Store.`} data={vasTable} tg={tg} range={range} totalLabel="Total VAS" />

      <Panel id="tabel-lob" title="Achievement by LOB (Qty)" desc="Unit terjual per staff · Apple per LOB dan Android per brand.">
        {/* phone: one row per staff, Apple and Android on their own lines */}
        <ul className="divide-y divide-slate-200 md:hidden dark:divide-slate-700">
          {[...rows.map((r) => ({ key: r.key, name: r.name, q: qtyOf(byKey.get(r.key) ?? []) })), { key: "__total", name: "TOTAL", q: qtyOf(staffLines) }].map(({ key, name, q }) => (
            <li key={key} className="py-2">
              <div className="flex justify-between gap-2"><p className="font-bold text-slate-950">{name}</p><p className="font-black">{num(q.device)} unit</p></div>
              <p className="text-xs text-slate-500"><b className="text-slate-700 dark:text-slate-200">Apple {num(q.apple)}</b> · {APPLE_LOBS.map((k) => `${k === "Mac" ? "MacBook" : k}\u00a0${num(q.lob[k])}`.replace(/ /g, "\u00a0")).join(" · ")}</p>
              <p className="text-xs text-slate-500"><b className="text-slate-700 dark:text-slate-200">Android {num(q.android)}</b>{androidCols.filter((c) => q.brand(c.key)).map((c) => ` · ${`${c.label} ${num(q.brand(c.key))}`.replace(/ /g, "\u00a0")}`).join("")}</p>
            </li>
          ))}
        </ul>
        <div className="sd-table-wrap hidden md:block">
          <table className="sd-table">
            <thead>
              <tr>
                <th rowSpan={2}>Nama</th>
                <th colSpan={APPLE_LOBS.length + 1} className="text-center">Apple</th>
                <th colSpan={androidCols.length + 1} className="text-center">Android</th>
                <th rowSpan={2} className="n">Total Device</th>
              </tr>
              <tr>
                {APPLE_LOBS.map((k) => <th key={k} className="n">{k === "Mac" ? "MacBook" : k}</th>)}
                <th className="n">Total</th>
                {androidCols.map((c) => <th key={c.key} className="n">{c.label}</th>)}
                <th className="n">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const q = qtyOf(byKey.get(r.key) ?? []);
                return (
                  <tr key={r.key}>
                    <td className="font-bold">{r.name}</td>
                    {APPLE_LOBS.map((k) => <td key={k} className="n">{num(q.lob[k])}</td>)}
                    <td className="n font-bold">{num(q.apple)}</td>
                    {androidCols.map((c) => <td key={c.key} className="n">{num(q.brand(c.key))}</td>)}
                    <td className="n font-bold">{num(q.android)}</td>
                    <td className="n font-black">{num(q.device)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {(() => {
                const q = qtyOf(staffLines);
                return (
                  <tr>
                    <td>TOTAL</td>
                    {APPLE_LOBS.map((k) => <td key={k} className="n">{num(q.lob[k])}</td>)}
                    <td className="n">{num(q.apple)}</td>
                    {androidCols.map((c) => <td key={c.key} className="n">{num(q.brand(c.key))}</td>)}
                    <td className="n">{num(q.android)}</td>
                    <td className="n">{num(q.device)}</td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Total Device = Apple (termasuk AirPods, seperti sebelumnya) + Android.</p>
      </Panel>
    </div>
  );
}

type Cell = { value: number; qty: number; target: number };
interface Breakdown {
  cols: Array<{ key: string; label: string; inTotal?: boolean }>;
  body: Array<{ r: { key: string; name: string }; cells: Array<Cell & { key: string }>; total: Cell }>;
  foot: Array<Cell & { key: string }>;
  total: Cell;
  hasTarget: boolean;
}

/** Salesperson × item table: value, unit and % of the staff target for each item, plus the group total. */
function BreakdownPanel({ id, title, desc, data, tg, range, note, totalLabel }: { id: string; title: string; desc: string; data: Breakdown; tg: number; range: boolean; note?: string; totalLabel: string }) {
  const tone = (c: Cell) => ((c.value / c.target) * 100 >= tg ? "text-emerald-600" : "text-rose-600");
  const Value = ({ c, strong, foot }: { c: Cell; strong?: boolean; foot?: boolean }) => (
    <>
      {c.value || c.qty || foot || strong ? rpf(c.value) : <span className="text-slate-300">–</span>}
      {(c.value !== 0 || c.qty !== 0 || foot || strong) && <div className={`text-xs ${foot ? "font-normal" : "font-normal text-slate-400"}`}>{num(c.qty)} unit</div>}
      {c.target > 0 && <div className={`text-xs font-semibold ${tone(c)}`}>{pct((c.value / c.target) * 100, 0)}{foot && !strong ? "" : ` dari ${rpc(c.target)}`}</div>}
    </>
  );
  return (
    <Panel id={id} title={title} desc={desc}>
      {/* phone: one card per staff — items listed vertically, empty items hidden */}
      <div className="space-y-3 md:hidden">
        {[...data.body.map((b) => ({ key: b.r.key, name: b.r.name, cells: b.cells, total: b.total })), { key: "__total", name: "TOTAL", cells: data.foot, total: data.total }].map((b) => (
          <div key={b.key} className={`rounded-2xl border p-3 ${b.key === "__total" ? "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/50" : "border-slate-200 dark:border-slate-700"}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-slate-950">{b.name}</p>
              <div className="text-right">
                <p className="font-black text-slate-950">{rpf(b.total.value)}</p>
                <p className="text-xs text-slate-400">{num(b.total.qty)} unit{b.total.target > 0 && <> · <span className={`font-semibold ${tone(b.total)}`}>{pct((b.total.value / b.total.target) * 100, 0)}</span> dari {rpc(b.total.target)}</>}</p>
              </div>
            </div>
            <ul className="mt-2 space-y-1 border-t border-dashed border-slate-200 pt-2 text-sm dark:border-slate-700">
              {b.cells.map((c, i) => ({ c, label: data.cols[i].label })).filter(({ c }) => c.value !== 0 || c.qty !== 0 || c.target > 0).map(({ c, label }) => (
                <li key={c.key} className="flex items-baseline justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">{label}</span>
                  <span className="text-right">
                    <b className="text-slate-950">{rpf(c.value)}</b>
                    <span className="ml-1 text-xs text-slate-400">{num(c.qty)}u</span>
                    {c.target > 0 && <span className={`ml-1 text-xs font-semibold ${tone(c)}`}>{pct((c.value / c.target) * 100, 0)}</span>}
                  </span>
                </li>
              ))}
              {!b.cells.some((c) => c.value !== 0 || c.qty !== 0 || c.target > 0) && <li className="text-xs text-slate-400">Belum ada penjualan.</li>}
            </ul>
          </div>
        ))}
      </div>
      <div className="sd-table-wrap hidden md:block">
        <table className="sd-table">
          <thead>
            <tr>
              <th>Nama</th>
              {data.cols.map((c) => <th key={c.key} className="n">{c.label}</th>)}
              <th className="n">{totalLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.body.map(({ r, cells, total }) => (
              <tr key={r.key}>
                <td className="font-bold">{r.name}</td>
                {cells.map((c) => <td key={c.key} className="n"><Value c={c} /></td>)}
                <td className="n font-black"><Value c={total} strong /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL</td>
              {data.foot.map((c) => <td key={c.key} className="n"><Value c={c} foot /></td>)}
              <td className="n"><Value c={data.total} foot strong /></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Hijau bila achievement ≥ {range ? "100%" : `time gone (${pct(tg)})`}. {note ? `${note} ` : ""}
        {data.hasTarget ? "" : "Target per item belum terbaca dari tab Target Store — hanya actual yang ditampilkan."}
      </p>
    </Panel>
  );
}
