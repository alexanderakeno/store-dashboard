"use client";
import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, Tag, X } from "lucide-react";
import { EmptyBlock, Panel } from "@/components/kit";
import { LOW_DAYS, SLOW_DAYS, type SohRow } from "@/lib/domain/soh";
import type { SkuPrices } from "@/lib/domain/skuPrice";
import { DEVICE_TYPES, SAMSUNG_SERIES, deviceType, isSamsung, samsungSeries, splitsByType, type DeviceType } from "@/lib/domain/sohGroups";

const TYPE_LABEL: Record<DeviceType, string> = { Phone: "Phone", Tablet: "Tablet", Watch: "Watch & Wearable", Lainnya: "Lainnya" };

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const num = (n: number) => nf.format(n);
const rp = (n: number) => `Rp ${nf.format(n)}`;
const isEol = (s: string) => /EOL/i.test(s);

/** Price popup of one SKU: its price-list model with every storage; the SKU's own variant is preselected. */
function SkuPricePopup({ prices, row, onClose }: { prices: SkuPrices; row: SohRow | null; onClose: () => void }) {
  const hit = row ? prices.byArticle[row.article.toUpperCase()] : undefined;
  const m = hit ? prices.models[hit[0]] : undefined;
  const [pick, setPick] = useState<{ article: string; vi: number } | null>(null);
  const vi = pick && row && pick.article === row.article ? pick.vi : (hit?.[1] ?? 0);
  const v = m?.variants[vi];
  const save = v ? v.normal - v.promo : 0;
  const base = v ? (v.credit ?? v.promo) : 0;
  return (
    <div
      id="sku-price"
      popover="auto"
      onToggle={(e) => (e as unknown as { newState: string }).newState === "closed" && onClose()}
      className="m-auto w-[min(94vw,520px)] rounded-2xl border border-slate-200 bg-white p-4 text-left text-slate-900 shadow-2xl backdrop:bg-slate-900/40 sm:p-5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      {row && m && v ? (
        <>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold tracking-wider text-blue-600 uppercase">{m.brand}</p>
              <p className="text-lg leading-tight font-black">{m.model}</p>
              <p className="mt-1 text-xs text-slate-500">
                {row.description || row.article} · <span className="font-mono">{row.article}</span> · SOH <b className="text-slate-700 dark:text-slate-200">{num(row.qty)}</b>
              </p>
            </div>
            <button type="button" popoverTarget="sku-price" popoverTargetAction="hide" className="sd-btn shrink-0" aria-label="Tutup">✕</button>
          </div>

          {m.variants.length > 1 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[11px] font-extrabold tracking-wider text-slate-500 uppercase">Semua pilihan</p>
              <div className="flex flex-wrap gap-1.5">
                {m.variants.map((x, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPick({ article: row.article, vi: i })}
                    className={`rounded-xl border px-2.5 py-1.5 text-left text-xs font-bold ${i === vi ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"}`}
                  >
                    {x.label}
                    {i === hit![1] && <span className={`ml-1 text-[10px] ${i === vi ? "text-blue-100" : "text-blue-600"}`}>• SKU ini</span>}
                    <span className={`block text-[11px] font-semibold ${i === vi ? "text-blue-100" : "text-slate-500"}`}>{rp(x.promo)}{isEol(x.status) ? " · EOL" : ""}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-[11px] font-extrabold tracking-wider text-slate-500 uppercase">{save > 0 ? "Promo price" : "Harga"} · {v.label}</p>
            <p className="text-2xl font-black text-blue-600">{rp(v.promo)}</p>
            {save > 0 && (
              <>
                <p className="text-sm text-slate-400 line-through">{rp(v.normal)}</p>
                <p className="text-sm font-bold text-emerald-600">Hemat {rp(save)} · {((save / v.normal) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</p>
              </>
            )}
            {v.credit != null && v.credit !== v.promo && <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200">Promo Cicilan {rp(v.credit)}</p>}
            {isEol(v.status) && <p className="mt-1"><span className="sd-badge amber">EOL</span></p>}
            {v.note && <p className="mt-2 text-xs text-slate-500">{v.note}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-dashed border-slate-300 pt-3 dark:border-slate-600">
              {[12, 24].map((n) => (
                <div key={n}>
                  <p className="text-[11px] font-extrabold tracking-wider text-slate-500 uppercase">{n} bulan</p>
                  <p className="font-black">{rp(Math.round(base / n))} <span className="text-xs font-semibold text-slate-400">/bln</span></p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Estimasi cicilan 0% dari {v.credit != null ? "harga promo cicilan" : "harga aktif"}.</p>
          </div>

          <Link
            href={`/pricelist?${new URLSearchParams({ ...(m.kind === "apple" ? { k: "apple" } : {}), b: m.brand, t: m.key, semua: "1" })}`}
            prefetch={false}
            className="mt-3 flex items-center justify-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
          >
            Buka di Price List <ChevronRight className="size-4" />
          </Link>
        </>
      ) : null}
    </div>
  );
}

const BALANCE: Record<SohRow["balance"], { cls: string; label: (r: SohRow) => string }> = {
  low: { cls: "red", label: (r) => `Stok tipis · ~${Math.max(1, Math.round(r.coverDays!))} hari` },
  ok: { cls: "green", label: (r) => `Aman · ~${Math.round(r.coverDays!)} hari` },
  slow: { cls: "amber", label: (r) => `Lambat · ~${Math.round(r.coverDays!)} hari` },
  unsold: { cls: "slate", label: () => "Belum terjual" },
};

/** Keeps `cat` / `s` in the address bar (shareable, survives reload) without a server round trip. */
function syncUrl(patch: Record<string, string | null>) {
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  window.history.replaceState(window.history.state, "", u);
}

/**
 * SOH table. All categories arrive in one server render; switching category and
 * searching happen here, so they never re-read Google Sheets.
 */
export function SohView({ categories, rows, prices, initialCat, initialSearch, initialType = "", initialSeries = "" }: { categories: string[]; rows: SohRow[]; prices?: SkuPrices; initialCat: string; initialSearch: string; initialType?: string; initialSeries?: string }) {
  const [open, setOpen] = useState<SohRow | null>(null);
  const priced = (r: SohRow) => !!prices?.byArticle[r.article.toUpperCase()];
  const priceOf = (r: SohRow) => {
    const h = prices?.byArticle[r.article.toUpperCase()];
    return h ? prices!.models[h[0]].variants[h[1]].promo : null;
  };
  const show = (r: SohRow) => {
    if (!priced(r)) return;
    setOpen(r);
    // open after the popup has rendered this SKU
    requestAnimationFrame(() => (document.getElementById("sku-price") as (HTMLElement & { showPopover?: () => void }) | null)?.showPopover?.());
  };
  const [cat, setCat] = useState(categories.includes(initialCat) ? initialCat : categories[0]);
  const [search, setSearch] = useState(initialSearch);
  const [type, setType] = useState(initialType);
  const [series, setSeries] = useState(initialSeries);
  const q = useDeferredValue(search);

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0) + r.qty);
    return m;
  }, [rows]);
  const terms = q.toUpperCase().split(/\s+/).filter(Boolean);
  // Android brands: Phone / Tablet / Watch tabs (only the types the brand has); Samsung phones: A / S / Z series
  const inCat = rows.filter((r) => r.category === cat);
  const typeOf = (r: SohRow) => deviceType(r.category, r.description);
  const types = splitsByType(cat) ? DEVICE_TYPES.filter((t) => inCat.some((r) => typeOf(r) === t)) : [];
  const curType = types.length > 1 ? (types.includes(type as DeviceType) ? (type as DeviceType) : types[0]) : null;
  const inType = curType ? inCat.filter((r) => typeOf(r) === curType) : inCat;
  const seriesList = isSamsung(cat) && curType === "Phone" ? SAMSUNG_SERIES.filter((x) => inType.some((r) => samsungSeries(r.description) === x)) : [];
  const curSeries = seriesList.length > 1 && (seriesList as readonly string[]).includes(series) ? series : "Semua";
  const shown = terms.length
    ? rows.filter((r) => terms.every((t) => `${r.article} ${r.description}`.toUpperCase().includes(t)))
    : curSeries !== "Semua"
      ? inType.filter((r) => samsungSeries(r.description) === curSeries)
      : inType;
  // "Semua" on Samsung phones: one block per series with its subtotal
  const groups: Array<{ label: string | null; rows: SohRow[] }> =
    !terms.length && seriesList.length > 1 && curSeries === "Semua"
      ? seriesList.map((x) => ({ label: x as string, rows: shown.filter((r) => samsungSeries(r.description) === x) }))
      : [{ label: null, rows: shown }];
  const sumQty = (l: SohRow[]) => l.reduce((a, r) => a + r.qty, 0);
  const totSoh = shown.reduce((a, r) => a + r.qty, 0);
  const totSold = shown.reduce((a, r) => a + r.sold, 0);
  const searching = terms.length > 0;

  const pickCat = (c: string) => {
    setCat(c);
    setSearch("");
    setType("");
    setSeries("");
    syncUrl({ cat: c, s: null, j: null, sr: null });
  };
  const pickType = (t: DeviceType) => {
    setType(t);
    setSeries("");
    syncUrl({ j: t, sr: null });
  };
  const pickSeries = (x: string) => {
    setSeries(x === "Semua" ? "" : x);
    syncUrl({ sr: x === "Semua" ? null : x });
  };
  const onSearch = (v: string) => {
    setSearch(v);
    syncUrl({ s: v.trim() || null });
  };

  return (
    <>
      <form className="sd-panel flex items-center gap-2 p-3 sm:p-4" role="search" onSubmit={(e) => e.preventDefault()}>
        <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
        <input value={search} onChange={(e) => onSearch(e.target.value)} className="sd-input flex-1" placeholder="Cari Article atau Description…" aria-label="Cari SOH" />
        {search && <button type="button" className="sd-btn" onClick={() => onSearch("")} aria-label="Hapus pencarian"><X className="size-4" /></button>}
      </form>
      {!searching && (
        <section className="sd-panel flex flex-wrap gap-1.5 p-2.5 sm:gap-2 sm:p-3" role="tablist" aria-label="Kategori SOH">
          {categories.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={c === cat} onClick={() => pickCat(c)} className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm ${c === cat ? "bg-slate-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
              {c} <span className="opacity-70">{num(totals.get(c) ?? 0)}</span>
            </button>
          ))}
        </section>
      )}
      {!searching && curType && (
        <section className="sd-panel space-y-2.5 p-2.5 sm:p-3">
          <div className="grid gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800" style={{ gridTemplateColumns: `repeat(${types.length}, minmax(0, 1fr))` }} role="tablist" aria-label={`Jenis ${cat}`}>
            {types.map((t) => {
              const l = inCat.filter((r) => typeOf(r) === t);
              return (
                <button key={t} type="button" role="tab" aria-selected={t === curType} onClick={() => pickType(t)} className={`rounded-xl px-1.5 py-2 text-sm leading-tight font-bold ${t === curType ? "bg-white text-slate-950 shadow-sm dark:bg-slate-600 dark:text-white" : "text-slate-500"}`}>
                  {TYPE_LABEL[t]}
                  <span className="block text-[11px] font-semibold opacity-70">{num(sumQty(l))} unit · {l.length} artikel</span>
                </button>
              );
            })}
          </div>
          {seriesList.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Series">
              {["Semua", ...seriesList].map((x) => {
                const l = x === "Semua" ? inType : inType.filter((r) => samsungSeries(r.description) === x);
                return (
                  <button key={x} type="button" role="tab" aria-selected={x === curSeries} onClick={() => pickSeries(x)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold ${x === curSeries ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200"}`}>
                    {x} <span className="font-semibold opacity-75">{num(sumQty(l))}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
      <Panel
        title={searching ? `Hasil cari "${q.trim()}"` : [cat, curType && TYPE_LABEL[curType], curSeries !== "Semua" && curSeries].filter(Boolean).join(" · ")}
        desc={searching ? `${shown.length} artikel di semua kategori.` : `Balance: stok ÷ rata-rata terjual per hari bulan ini (< ${LOW_DAYS} hari = tipis, > ${SLOW_DAYS} hari = lambat).`}
      >
        <div className="mb-3 flex flex-wrap gap-2"><span className="sd-badge blue">SOH {num(totSoh)}</span><span className="sd-badge slate">Sold {num(totSold)}</span><span className="sd-badge slate">{shown.length} artikel</span></div>
        {/* Mobile: just the type name and its stock — no sideways scrolling. */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 sm:hidden dark:border-slate-700">
          <div className="flex justify-between bg-slate-50 px-3 py-2 text-[11px] font-extrabold tracking-wider text-slate-500 uppercase dark:bg-slate-800/60"><span>Tipe</span><span>Stok</span></div>
          {shown.length ? (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {groups.flatMap((g) => [
                ...(g.label ? [<li key={`g|${g.label}`} className="flex justify-between bg-slate-50 px-3 py-1.5 text-[11px] font-extrabold tracking-wider text-slate-600 uppercase dark:bg-slate-800/60 dark:text-slate-300"><span>{g.label}</span><span className="tabular-nums">{num(sumQty(g.rows))}</span></li>] : []),
                ...g.rows.map((r) => (
                <li key={`${r.category}|${r.article}`}>
                  <button type="button" disabled={!priced(r)} onClick={() => show(r)} className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left ${priced(r) ? "active:bg-blue-50 dark:active:bg-blue-950/30" : "cursor-default"}`}>
                    <span className="min-w-0 text-[13px] leading-snug font-semibold text-slate-800 dark:text-slate-100">
                      {r.description || r.article}
                      <span className="mt-0.5 block font-mono text-[11px] font-medium text-slate-400">{r.article}{searching && <> · {r.category}</>}</span>
                      {priceOf(r) != null && <span className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-blue-600"><Tag className="size-3" /> {rp(priceOf(r)!)} ›</span>}
                    </span>
                    <b className={`shrink-0 text-base tabular-nums ${r.balance === "low" ? "text-rose-600" : "text-slate-950 dark:text-white"}`}>{num(r.qty)}</b>
                  </button>
                </li>
                )),
              ])}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-slate-500">{searching ? "Tidak ada Article/Description yang cocok." : "Kategori ini kosong."}</p>
          )}
          <div className="flex justify-between border-t border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-extrabold dark:border-slate-700 dark:bg-slate-800/60"><span>TOTAL</span><span className="tabular-nums">{num(totSoh)}</span></div>
        </div>
        <div className="sd-table-wrap max-sm:hidden"><table className="sd-table">
          <thead><tr><th>Article</th><th>Description</th>{searching && <th>Kategori</th>}<th className="n">Qty SOH</th><th className="n">Qty Sold</th><th>Balance View</th>{prices && <th className="n">Harga</th>}</tr></thead>
          <tbody>
            {shown.length ? groups.flatMap((g) => [
              ...(g.label ? [<tr key={`g|${g.label}`} className="bg-slate-50 dark:bg-slate-800/60"><td colSpan={2} className="text-xs font-extrabold tracking-wider text-slate-600 uppercase dark:text-slate-300">{g.label}</td><td className="n font-extrabold">{num(sumQty(g.rows))}</td><td className="n font-extrabold">{num(g.rows.reduce((a, r) => a + r.sold, 0))}</td><td />{prices && <td />}</tr>] : []),
              ...g.rows.map((r) => (
              <tr key={`${r.category}|${r.article}`} onClick={() => show(r)} className={priced(r) ? "cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-950/20" : undefined}>
                <td className="font-mono text-xs">{r.article}</td>
                <td>{priced(r) ? <span className="font-semibold text-blue-700 dark:text-blue-300">{r.description}</span> : r.description}</td>
                {searching && <td>{r.category}</td>}
                <td className="n">{num(r.qty)}</td>
                <td className="n">{num(r.sold)}</td>
                <td><span className={`sd-badge ${BALANCE[r.balance].cls}`}>{BALANCE[r.balance].label(r)}</span></td>
                {prices && <td className="n whitespace-nowrap">{priceOf(r) != null ? <span className="font-semibold text-blue-600">{rp(priceOf(r)!)} ›</span> : <span className="text-slate-400">—</span>}</td>}
              </tr>
              )),
            ]) : <tr><td colSpan={(searching ? 6 : 5) + (prices ? 1 : 0)}><EmptyBlock title="Tidak ada artikel" need={false}>{searching ? "Tidak ada Article/Description yang cocok." : "Kategori ini kosong."}</EmptyBlock></td></tr>}
          </tbody>
          <tfoot><tr><td>TOTAL</td><td />{searching && <td />}<td className="n">{num(totSoh)}</td><td className="n">{num(totSold)}</td><td />{prices && <td />}</tr></tfoot>
        </table></div>
        {prices && prices.models.length > 0 && <p className="mt-2 text-xs text-slate-500">Ketuk SKU yang ada harganya untuk melihat price list-nya (semua pilihan storage).</p>}
      </Panel>
      {prices && <SkuPricePopup prices={prices} row={open} onClose={() => setOpen(null)} />}
    </>
  );
}
