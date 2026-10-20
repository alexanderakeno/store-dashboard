"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { typeSales, type ArticleSale, type TypeSale } from "@/lib/domain/drill";

const nf0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const num = (n: number) => nf0.format(n);
const rp = (n: number) => `${n < 0 ? "-" : ""}Rp${nf0.format(Math.abs(Math.round(n)))}`;
/** "3 warna" when the variants differ by colour, "2 varian" when the names don't show a colour. */
function variantCount(t: TypeSale): string {
  const n = t.variants.length;
  return t.variants.some((v) => v.color) ? `${n} warna` : n > 1 ? `${n} varian` : "";
}
function rpc(n: number) {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e9) return `${s}Rp${nf2.format(a / 1e9)} M`;
  if (a >= 1e6) return `${s}Rp${nf1.format(a / 1e6)} jt`;
  if (a >= 1e3) return `${s}Rp${nf0.format(a / 1e3)} rb`;
  return `${s}Rp${nf0.format(a)}`;
}

/** Article row that expands to the sales people who sold it. */
function ArticleRow({ a, title, sub }: { a: ArticleSale; title: string; sub: string }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-800/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-snug font-bold">{title}</span>
          <span className="block text-[11px] text-slate-500">{sub}</span>
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
  );
}

/**
 * Second-level Overview popup: one product (LOB / brand / provider) → product type (e.g. "iPhone 18 Pro
 * Max 256GB") → colour → sales person. VAS has no colours, so it lists articles directly.
 * The article list is fetched only when the popup opens, so the Overview page stays light.
 */
export function ProductDrill({ id, group, label, actual, qty, share, query }: { id: string; group: string; label: string; actual: number; qty: number; share: number | null; query: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<ArticleSale[] | null>(null);
  const [error, setError] = useState("");
  const loading = useRef(false);
  const byType = new URLSearchParams(query).get("g") !== "vas";
  const types = items && byType ? typeSales(items) : null;
  const [openType, setOpenType] = useState<string | null>(null);
  const sel: TypeSale | null = types?.find((t) => t.type === openType) ?? null;
  const showType = (t: string | null) => {
    setOpenType(t);
    ref.current?.scrollTo({ top: 0 });
  };

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
      const state = (e as Event & { newState?: string }).newState;
      if (state === "open") void load();
      if (state === "closed") setOpenType(null); // reopening starts at the type list again
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
      {sel ? (
        <>
          <div className="border-b border-slate-200 px-4 py-3 sm:px-5 dark:border-slate-700">
            <button type="button" onClick={() => showType(null)} className="text-[13px] font-bold text-blue-600">‹ Semua tipe {label}</button>
            <p className="mt-1 text-base font-black">{sel.type}</p>
            <p className="text-xs text-slate-500 tabular-nums">{[`${num(sel.qty)} qty`, rp(sel.value), variantCount(sel)].filter(Boolean).join(" · ")}</p>
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {sel.variants.map((v) => (
              <li key={v.article || v.description}>
                <ArticleRow a={v} title={v.color || v.description || v.article} sub={v.color ? v.article : `${v.article} · ${label}`} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="grid grid-cols-3 gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 dark:border-slate-700">
          <div><p className="text-xs text-slate-500">Sales</p><p className="text-lg font-black">{rpc(actual)}</p></div>
          <div><p className="text-xs text-slate-500">Qty</p><p className="text-lg font-black">{num(qty)}</p></div>
          <div><p className="text-xs text-slate-500">Share</p><p className="text-lg font-black">{share == null ? "—" : `${nf1.format(share)}%`}</p></div>
        </div>
      )}
      {!items && !error && (
        <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Memuat rincian…</p>
      )}
      {error && <p className="px-4 py-6 text-center text-sm text-rose-600" role="alert">{error}</p>}
      {!sel && types && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {types.map((t) => (
            <li key={t.type}>
              <button type="button" onClick={() => showType(t.type)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-800/50">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-snug font-bold">{t.type}</span>
                  <span className="block text-[11px] text-slate-500">{variantCount(t) || t.variants[0]?.article} · {label}</span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <b className="block text-sm">{num(t.qty)} qty</b>
                  <span className="block text-[11px] text-slate-500">{rp(t.value)}</span>
                </span>
                <span className="shrink-0 text-slate-400" aria-hidden>›</span>
              </button>
            </li>
          ))}
          {!types.length && <li className="px-4 py-6 text-center text-sm text-slate-500">Belum ada penjualan.</li>}
        </ul>
      )}
      {!byType && items && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {items.map((a) => (
            <li key={a.article || a.description}>
              <ArticleRow a={a} title={a.description || a.article} sub={`${a.article} · ${label}`} />
            </li>
          ))}
          {!items.length && <li className="px-4 py-6 text-center text-sm text-slate-500">Belum ada penjualan.</li>}
        </ul>
      )}
    </div>
  );
}
