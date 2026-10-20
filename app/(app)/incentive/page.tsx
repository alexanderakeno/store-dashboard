import Link from "next/link";
import { appConfig } from "@/config/app";
import { DEFAULT_RULES } from "@/config/business";
import { PageIntro, Panel } from "@/components/kit";
import { ParamDate, ParamSelect } from "@/components/kit/controls";
import { PageStatus } from "@/components/layout/PageStatus";
import { staffNames } from "@/components/modules/staffList";
import { clampRange, linesIn } from "@/lib/domain/extra";
import { DEVICE_LOBS, incentiveView, nameKey, type IncentiveRow } from "@/lib/domain/incentive";
import { monthStart } from "@/lib/domain/period";
import { num, rp } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";

const LOB_LABEL: Record<string, string> = { Mac: "MacBook", iPhone: "iPhone", iPad: "iPad", "Apple Watch": "Apple Watch" };

/** "Rp60.000" over "2 unit"; a dash when nothing was sold. */
function Cell({ fee, sub }: { fee: number; sub: string | null }) {
  if (!fee && !sub) return <span className="text-slate-400">–</span>;
  return (
    <>
      <span className="block font-semibold tabular-nums">{rp(fee)}</span>
      {sub && <span className="block text-[11px] text-slate-500">{sub}</span>}
    </>
  );
}

const unit = (q: number) => (q ? `${num(q)} unit` : null);
const accSub = (r: IncentiveRow) => (r.acc ? `${num(r.acc.qty)} pcs` : null);
const qoalaSub = (r: IncentiveRow) => (r.qoala.policies ? `${num(r.qoala.policies)} polis` : null);

/**
 * Breakdown shown under a staff: devices, Qoala, accessories per supplier. Only the admin sees
 * Qoala split per price tier — that would reveal the scheme.
 */
function Breakdown({ r, tierLabel, admin }: { r: IncentiveRow; tierLabel: (min: number) => string; admin: boolean }) {
  const sups = Object.entries(r.acc?.bySupplier ?? {}).sort((a, b) => b[1].fee - a[1].fee);
  return (
    <div className="grid gap-4 text-[13px] sm:grid-cols-3">
      <div>
        <p className="sd-label">Device</p>
        {DEVICE_LOBS.map((l) => (
          <p key={l} className="flex justify-between gap-3"><span className="text-slate-600">{LOB_LABEL[l]} · {num(r.device[l]?.qty ?? 0)} unit</span><span className="tabular-nums">{rp(r.device[l]?.fee ?? 0)}</span></p>
        ))}
      </div>
      <div>
        <p className="sd-label">{admin ? "Qoala per harga polis" : "Qoala"}</p>
        {admin ? (
          r.qoala.tiers.map((t) => (
            <p key={t.min} className="flex justify-between gap-3"><span className="text-slate-600">{tierLabel(t.min)} · {num(t.policies)} polis</span><span className="tabular-nums">{rp(t.policies * t.fee)}</span></p>
          ))
        ) : (
          <p className="flex justify-between gap-3"><span className="text-slate-600">{num(r.qoala.policies)} polis</span><span className="tabular-nums">{rp(r.qoala.fee)}</span></p>
        )}
      </div>
      <div>
        <p className="sd-label">Aksesoris per supplier</p>
        {sups.length ? (
          sups.map(([s, x]) => (
            <p key={s} className="flex justify-between gap-3"><span className="min-w-0 truncate text-slate-600">{s} · {num(x.qty)}</span><span className="tabular-nums">{rp(x.fee)}</span></p>
          ))
        ) : (
          <p className="text-slate-500">{r.acc ? "Belum ada" : "Tidak ada di leaderboard sheet"}</p>
        )}
      </div>
    </div>
  );
}

export default async function IncentivePage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Est. Incentive" p={p} />;
  // the scheme (rates, Qoala price tiers) is for the admin only; viewers see the resulting amounts
  const admin = p.session.role === "admin";
  const { from, to } = clampRange(p.month, p.asOf, p.q.from, p.q.to);
  // rules cached before this feature existed have no `incentive` yet (cache lives a few minutes)
  const rules = p.snap.rules.incentive ?? DEFAULT_RULES.incentive;
  const board = p.snap.extras.accFocus ?? null;
  const view = incentiveView(linesIn(p.snap, from, to), rules, board, staffNames(p.snap));
  const pick = p.q.staff ? view.rows.find((r) => nameKey(r.name) === nameKey(p.q.staff)) : undefined;
  const rows = pick ? [pick] : view.rows;
  const shown = pick
    ? { device: pick.deviceFee, acc: pick.acc?.fee ?? 0, qoala: pick.qoala.fee, all: pick.total }
    : view.total;

  const tiers = [...rules.qoalaTiers].sort((a, b) => a.min - b.min);
  const jt = (n: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n / 1e6)} jt`;
  const tierLabel = (min: number) => {
    const i = tiers.findIndex((t) => t.min === min);
    const next = tiers[i + 1];
    return min === 0 ? `< ${jt(next?.min ?? 0)}` : next ? `${jt(min)}–<${jt(next.min)}` : `≥ ${jt(min)}`;
  };

  return (
    <div className="sd-content">
      <PageIntro eyebrow={appConfig().storeCode || "STORE"} title="Estimasi Incentive" desc="Device & Qoala dihitung dari data Sales Person; aksesoris dari leaderboard ACC Fokus di sheet." />

      <section className="sd-panel grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
        <ParamDate param="from" label="Dari Tanggal" value={from} min={monthStart(p.month)} max={p.asOf} />
        <ParamDate param="to" label="Sampai Tanggal" value={to} min={monthStart(p.month)} max={p.asOf} />
        <ParamSelect param="staff" label="Staff" value={pick?.name ?? ""} options={[{ value: "", label: "Semua Staff" }, ...view.rows.map((r) => ({ value: r.name, label: r.name }))]} />
      </section>

      <div className="sd-hero p-5 sm:p-6">
        <p className="text-xs font-black tracking-[.12em] text-white/80 uppercase">Total Est. Incentive{pick ? ` · ${pick.name}` : ""}</p>
        <p className="mt-2 text-3xl font-black tabular-nums">{rp(shown.all)}</p>
        <p className="mt-1 text-sm text-white/80">{from} – {to}</p>
        <div className="mt-5 grid max-w-xl grid-cols-3 gap-2 text-sm sm:gap-3">
          {[["Device", shown.device], ["Aksesoris", shown.acc], ["Qoala", shown.qoala]].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/15 p-3"><p className="text-white/80">{k}</p><p className="font-black tabular-nums">{rp(v as number)}</p></div>
          ))}
        </div>
      </div>

      {admin && !board && (
        <div className="alert warn">
          {p.snap.extras.accFocus === undefined
            ? "Data sheet belum dibaca ulang sejak fitur ini dipasang — klik Perbarui di kanan atas untuk memuat incentive aksesoris."
            : 'Leaderboard ACC Fokus tidak ditemukan di tab "Data - Akeno" file bulan ini — incentive aksesoris dihitung 0.'}
        </div>
      )}
      {admin && view.qoalaUncertain > 0 && <div className="alert warn">{view.qoalaUncertain} baris Qoala jumlah polisnya tidak bisa dipastikan dari harga di MR — harga per polis (dan tier-nya) baris itu mungkin kurang tepat. Cek di Cut Off &amp; Rekonsiliasi.</div>}

      <Panel title="Rincian per Staff" desc={pick ? undefined : "Klik nama untuk rincian per staff."} className="!p-4 sm:!p-6">
        {/* phone: one card per staff */}
        <div className="space-y-2 sm:hidden">
          {rows.map((r, i) => (
            <details key={r.name} className="sd-log-acct !block" open={!!pick}>
              <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                <span className="w-5 text-xs font-bold text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{r.name}</span>
                  <span className="block text-[11px] text-slate-500">Device {rp(r.deviceFee)} · Aks {rp(r.acc?.fee ?? 0)} · Qoala {rp(r.qoala.fee)}</span>
                </span>
                <b className="shrink-0 text-sm tabular-nums">{rp(r.total)}</b>
              </summary>
              <div className="mt-3 border-t border-[var(--block-border)] pt-3"><Breakdown r={r} tierLabel={tierLabel} admin={admin} /></div>
            </details>
          ))}
        </div>

        {/* desktop: table */}
        <div className="sd-table-wrap max-sm:hidden">
          <table className="sd-table">
            <thead>
              <tr><th>#</th><th>Nama</th>{DEVICE_LOBS.map((l) => <th key={l} className="n">{LOB_LABEL[l]}</th>)}<th className="n">Aksesoris</th><th className="n">Qoala</th><th className="n">Total</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name}>
                  <td>{i + 1}</td>
                  <td className="font-bold">
                    <Link href={withQuery("/incentive", p.q, { staff: pick ? null : r.name })} prefetch={false} className="text-blue-600 hover:underline">{r.name}</Link>
                  </td>
                  {DEVICE_LOBS.map((l) => <td key={l} className="n"><Cell fee={r.device[l]?.fee ?? 0} sub={unit(r.device[l]?.qty ?? 0)} /></td>)}
                  <td className="n"><Cell fee={r.acc?.fee ?? 0} sub={accSub(r)} /></td>
                  <td className="n"><Cell fee={r.qoala.fee} sub={qoalaSub(r)} /></td>
                  <td className="n font-black tabular-nums">{rp(r.total)}</td>
                </tr>
              ))}
            </tbody>
            {!pick && (
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  {DEVICE_LOBS.map((l) => <td key={l} className="n">{rp(view.rows.reduce((a, r) => a + (r.device[l]?.fee ?? 0), 0))}</td>)}
                  <td className="n">{rp(view.total.acc)}</td>
                  <td className="n">{rp(view.total.qoala)}</td>
                  <td className="n">{rp(view.total.all)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {pick && <div className="mt-4 hidden sm:block"><Breakdown r={pick} tierLabel={tierLabel} admin={admin} /></div>}
      </Panel>

      {admin && (
      <Panel title="Skema" desc="Hanya terlihat oleh admin." className="!p-4 sm:!p-6">
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li><b>Device:</b> {DEVICE_LOBS.map((l) => `${LOB_LABEL[l]} ${rp(rules.perUnit[l] ?? 0)}`).join(" · ")} per unit. Retur mengurangi.</li>
          <li><b>Qoala:</b> dihitung per polis, lalu dijumlahkan — {tiers.map((t) => `${tierLabel(t.min)} ${rp(t.fee)}`).join(" · ")}.</li>
          <li><b>Aksesoris:</b> dari {board ? <>&quot;{board.title}&quot;</> : "leaderboard ACC Fokus"} (tab Data - Akeno). Angka ini MTD dari sheet, tidak ikut filter tanggal.</li>
          <li className="text-xs text-slate-500">Penjualan akun online (Mapemall) tidak dihitung. Skema bisa diubah admin di Settings → Aturan bisnis (kunci <code>incentive</code>).</li>
        </ul>
      </Panel>
      )}
    </div>
  );
}
