"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ArticleSale } from "@/lib/domain/drill";

const nf0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const num = (n: number) => nf0.format(n);
const rp = (n: number) => `${n < 0 ? "-" : ""}Rp${nf0.format(Math.abs(Math.round(n)))}`;
function rpc(n: number) {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e9) return `${s}Rp${nf2.format(a / 1e9)} M`;
  if (a >= 1e6) return `${s}Rp${nf1.format(a / 1e6)} jt`;
  if (a >= 1e3) return `${s}Rp${nf0.format(a / 1e3)} rb`;
  return `${s}Rp${nf0.format(a)}`;
}

/**
 * Second-level Overview popup: one product (LOB / brand / provider) → articles sold → sales person.
 * The article list is fetched only when the popup opens, so the Overview page stays light.
 */
export function ProductDrill({ id, group, label, actual, qty, share, query }: { id: string; group: string; label: string; actual: number; qty: number; share: number | null; query: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<ArticleSale[] | null>(null);
  const [error, setError] = useState("");
  const loading = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const load = async () => {
      if (loading.current || items) return;
      loading.current = true;
      setError("");
      try {
        const r = await fetch(`/api/drill?${query}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? `Gagal memuat (HTTP ${r.status})`);
        setItems(j.items ?? []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        loading.current = false;
      }
    };
    const onToggle = (e: Event) => {
      if ((e as Event & { newState?: string }).newState === "open") void load();
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, [items, query]);

  return (
    <div ref={ref} id={id} popover="auto" className="m-auto max-h-[88vh] w-[min(94vw,520px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl backdrop:bg-slate-900/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="min-w-0">
          <p className="text-[11px] font-black tracking-[.12em] text-blue-600 uppercase">{group}</p>
          <p className="text-base font-black">Rincian {label}</p>
        </div>
        <button type="button" popoverTarget={id} popoverTargetAction="hide" className="sd-btn" aria-label="Tutup">✕</button>
      </div>
      <div className="grid grid-cols-3 gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 dark:border-slate-700">
        <div><p className="text-xs text-slate-500">Sales</p><p className="text-lg font-black">{rpc(actual)}</p></div>
        <div><p className="text-xs text-slate-500">Qty</p><p className="text-lg font-black">{num(qty)}</p></div>
        <div><p className="text-xs text-slate-500">Share</p><p className="text-lg font-black">{share == null ? "—" : `${nf1.format(share)}%`}</p></div>
      </div>
      {!items && !error && (
        <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Memuat rincian…</p>
      )}
      {error && <p className="px-4 py-6 text-center text-sm text-rose-600" role="alert">{error}</p>}
      {items && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {items.map((a) => (
            <li key={a.article || a.description}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-800/50 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-snug font-bold">{a.description || a.article}</span>
                    <span className="block text-[11px] text-slate-500"><span className="font-mono">{a.article}</span> · {label}</span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <b className="block text-sm">{num(a.qty)} qty</b>
                    <span className="block text-[11px] text-slate-500">{rp(a.value)}</span>
                  </span>
                  <span className="shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden>⌄</span>
                </summary>
                <ul className="space-y-1.5 bg-slate-50/70 px-4 pt-1 pb-3 pl-7 sm:px-5 sm:pl-8 dark:bg-slate-800/30">
                  {a.staff.map((st, k) => (
                    <li key={k} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{st.name}</span>
                      <span className="shrink-0 text-slate-500 tabular-nums">{num(st.qty)} qty · {rp(st.value)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
          {!items.length && <li className="px-4 py-6 text-center text-sm text-slate-500">Belum ada penjualan.</li>}
        </ul>
      )}
    </div>
  );
}
