import { EmptyBlock, Panel } from "@/components/kit";
import type { PriceChange, PriceUpdate } from "@/lib/domain/priceHistory";
import { dmy } from "@/lib/format";

const nf = new Intl.NumberFormat("id-ID");
const rp = (n: number | null) => (n == null ? "–" : `Rp ${nf.format(n)}`);
const pays = (promo: number | null, normal: number | null) => (promo && promo > 0 ? promo : normal);

function ChangeRow({ c }: { c: PriceChange }) {
  const oldP = pays(c.oldPromo, c.oldNormal);
  const newP = pays(c.newPromo, c.newNormal);
  const diff = oldP != null && newP != null ? newP - oldP : null;
  const tone = c.change === "turun" ? "text-emerald-600" : c.change === "naik" ? "text-rose-600" : "text-slate-500";
  return (
    <li className="flex items-start gap-3 py-2.5 text-sm">
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{c.name}</span>
        <span className="block text-xs text-slate-500">{[c.brand, c.series].filter(Boolean).join(" · ")}</span>
        {(c.change === "naik" || c.change === "turun") && c.oldNormal !== c.newNormal && c.oldPromo !== c.oldNormal && (
          <span className="block text-xs text-slate-500">Normal {rp(c.oldNormal)} → {rp(c.newNormal)}</span>
        )}
        {c.oldCredit != null && c.newCredit != null && c.oldCredit !== c.newCredit && <span className="block text-xs text-slate-500">Cicilan {rp(c.oldCredit)} → {rp(c.newCredit)}</span>}
      </span>
      <span className="shrink-0 text-right">
        {c.change === "baru" && <><span className="sd-badge blue">Baru</span><span className="mt-0.5 block text-xs tabular-nums">{rp(newP)}</span></>}
        {c.change === "hilang" && <><span className="sd-badge slate">Tidak ada lagi</span><span className="mt-0.5 block text-xs text-slate-500 tabular-nums">terakhir {rp(oldP)}</span></>}
        {c.change === "status" && <span className="text-xs font-semibold">{c.oldStatus} → <b className="text-amber-600">{c.newStatus}</b></span>}
        {(c.change === "naik" || c.change === "turun") && (
          <>
            <span className="block text-xs text-slate-400 line-through tabular-nums">{rp(oldP)}</span>
            <span className="block font-bold tabular-nums">{rp(newP)}</span>
            {diff != null && <span className={`block text-xs font-bold tabular-nums ${tone}`}>{diff > 0 ? "▲ +" : "▼ −"}{nf.format(Math.abs(diff))}</span>}
          </>
        )}
      </span>
    </li>
  );
}

const CHIPS: Array<{ k: keyof PriceUpdate["count"]; label: string; cls: string }> = [
  { k: "turun", label: "turun", cls: "green" },
  { k: "naik", label: "naik", cls: "red" },
  { k: "baru", label: "baru", cls: "blue" },
  { k: "hilang", label: "hilang", cls: "slate" },
  { k: "status", label: "ganti status", cls: "amber" },
];

/** Price history: one card per price list upload with what changed vs the previous upload. */
export function PriceHistory({ updates, timeZone }: { updates: PriceUpdate[]; timeZone: string }) {
  if (!updates.length)
    return (
      <Panel>
        <EmptyBlock title="Belum ada riwayat harga" need={false}>
          Riwayat mulai tercatat dari import price list berikutnya: setiap import dibandingkan dengan price list sebelumnya (harga turun / naik, tipe baru, tipe hilang, ganti status).
        </EmptyBlock>
      </Panel>
    );
  const at = (ts: string) => new Date(ts).toLocaleString("id-ID", { timeZone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-3">
      {updates.map((u, i) => {
        const total = u.changes.length;
        return (
          <section key={`${u.ts}-${u.kind}`} className="sd-panel p-4 sm:p-5">
            <details open={i === 0 && total > 0}>
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black tracking-[.12em] text-blue-600 uppercase">{u.kind === "apple" ? "Apple" : "Android"}</p>
                    <p className="text-base font-black">Price list {u.date ? dmy(u.date) : "–"}</p>
                    <p className="text-xs text-slate-500">
                      {u.prevDate ? `dibanding ${dmy(u.prevDate)} · ` : ""}diimport {at(u.ts)}{u.size ? ` · ${u.size}` : ""}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">{total ? `${total} perubahan ›` : "tidak ada perubahan"}</span>
                </div>
                {total > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CHIPS.filter((c) => u.count[c.k]).map((c) => (
                      <span key={c.k} className={`sd-badge ${c.cls}`}>{u.count[c.k]} {c.label}</span>
                    ))}
                  </div>
                )}
              </summary>
              {total > 0 && (
                <ul className="sd-log-list mt-3 border-t border-[var(--block-border)]">
                  {u.changes.map((c, j) => <ChangeRow key={j} c={c} />)}
                </ul>
              )}
            </details>
          </section>
        );
      })}
    </div>
  );
}
