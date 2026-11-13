"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { AlertTriangle, Search, Upload, X } from "lucide-react";
import { EmptyBlock } from "@/components/kit";
import type { PwpView } from "@/lib/domain/pwpPromo";
import { PwpPromoForm } from "./PwpPromoForm";

/** A program as the page sends it: the view plus SOH per model / accessory (null = SOH not read). */
export type PwpCard = PwpView & { soh: { models: Array<number | null>; items: Array<Array<number | null>> } };

const nf = new Intl.NumberFormat("id-ID");
const rp = (n: number) => `Rp${nf.format(Math.round(n))}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const day = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const STATE = { aktif: { label: "Aktif", cls: "green" }, akan: { label: "Akan datang", cls: "blue" }, selesai: { label: "Selesai", cls: "slate" } } as const;
const FILTERS = [{ key: "", label: "Aktif" }, { key: "akan", label: "Akan datang" }, { key: "all", label: "Semua" }];

const words = (s: string) => s.toUpperCase().split(/\s+/).filter(Boolean);
const hasAll = (terms: string[], text: string) => terms.every((t) => text.includes(t));

/** PWP promos of all brands: per device model, every accessory that may be paired, its cashback and the price to pay. */
export function PwpPromoView({ cards, isAdmin, current, initialSearch, initialBrand }: { cards: PwpCard[]; isAdmin: boolean; current: string | null; initialSearch: string; initialBrand: string }) {
  const [search, setSearch] = useState(initialSearch);
  const [brand, setBrand] = useState(initialBrand);
  const [filter, setFilter] = useState("");
  const [upload, setUpload] = useState(false);
  const q = useDeferredValue(search);
  const terms = useMemo(() => words(q), [q]);

  const syncUrl = (patch: Record<string, string | null>) => {
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries(patch)) v ? u.searchParams.set(k, v) : u.searchParams.delete(k);
    window.history.replaceState(null, "", u);
  };
  // every word must be in the same place: the title, one device model, or one accessory / bundle
  const matches = (c: PwpCard) =>
    !terms.length ||
    [`${c.title} ${c.brand} ${c.br}`, ...c.models.map((m) => `${m.name} ${m.colors.join(" ")} ${m.articles.join(" ")}`), ...c.offers.map((o) => `${o.items.map((i) => `${i.description} ${i.articles.join(" ")}`).join(" ")} ${o.codes.join(" ")}`)].some((t) => hasAll(terms, t.toUpperCase()));
  const inFilter = (c: PwpCard, f = filter) => (f === "all" ? true : f === "akan" ? c.state === "akan" : c.state === "aktif");
  const base = cards.filter((c) => matches(c));
  const brands = [...new Set(cards.map((c) => c.brand))].sort();
  const shown = base.filter((c) => inFilter(c) && (!brand || c.brand === brand)).sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));

  return (
    <>
      {isAdmin && (
        <section className="sd-panel p-3 sm:p-4">
          <button type="button" className="sd-btn w-full justify-center sm:w-auto" aria-expanded={upload} onClick={() => setUpload((x) => !x)}>
            <Upload className="size-4" /> {upload ? "Tutup upload" : "Upload file PWP terbaru"}
          </button>
          {upload && <div className="mt-3"><PwpPromoForm current={current} onDone={() => setUpload(false)} /></div>}
        </section>
      )}
      <form className="sd-panel flex items-center gap-2 p-3 sm:p-4" role="search" onSubmit={(e) => e.preventDefault()}>
        <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
        <input value={search} onChange={(e) => { setSearch(e.target.value); syncUrl({ s: e.target.value.trim() || null }); }} className="sd-input flex-1" placeholder="Cari tipe HP, aksesoris, atau kode MOP…" aria-label="Cari promo PWP" />
        {search && <button type="button" className="sd-btn" onClick={() => { setSearch(""); syncUrl({ s: null }); }} aria-label="Hapus pencarian"><X className="size-4" /></button>}
      </form>
      <section className="sd-panel space-y-2 p-2.5 sm:p-3" aria-label="Brand & status">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {["", ...brands].map((b) => (
            <button key={b || "all"} type="button" aria-pressed={brand === b} onClick={() => { setBrand(b); syncUrl({ b: b || null }); }} className={`rounded-xl px-2.5 py-1.5 text-xs font-bold sm:px-4 sm:py-2 sm:text-sm ${brand === b ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300"}`}>
              {b || "Semua brand"} <span className="opacity-70">{base.filter((c) => inFilter(c) && (!b || c.brand === b)).length}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-slate-200 pt-2 sm:gap-2 dark:border-slate-700">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={`rounded-xl px-2.5 py-1 text-xs font-semibold sm:px-3 sm:py-1.5 ${filter === f.key ? "bg-slate-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
              {f.label} <span className="opacity-70">{base.filter((c) => inFilter(c, f.key) && (!brand || c.brand === brand)).length}</span>
            </button>
          ))}
        </div>
      </section>
      {shown.length ? (
        <div className="grid gap-4 xl:grid-cols-2">{shown.map((c) => <Card key={c.id} c={c} terms={terms} />)}</div>
      ) : (
        <div className="sd-panel p-5"><EmptyBlock title="Tidak ada promo PWP" need={false}>{terms.length ? "Tidak ada promo yang cocok dengan pencarian." : "Tidak ada promo PWP untuk filter ini."}</EmptyBlock></div>
      )}
    </>
  );
}

function Card({ c, terms }: { c: PwpCard; terms: string[] }) {
  // a search that names a model opens that model
  const hit = terms.length ? c.models.findIndex((m) => hasAll(terms, `${m.name} ${m.articles.join(" ")}`.toUpperCase())) : -1;
  const [pick, setPick] = useState<number | null>(null);
  const mi = pick ?? Math.max(0, hit);
  const m = c.models[mi];
  const st = STATE[c.state];
  const left = c.daysLeft;
  const rows = (m?.offers ?? [])
    .map((oi) => {
      const o = c.offers[oi];
      const acc = o.items.reduce((a, it) => a + it.price, 0);
      return { oi, o, acc, nett: acc - o.cashback };
    })
    .sort((a, b) => a.nett - b.nett || a.o.items[0].description.localeCompare(b.o.items[0].description));
  const codes = [...new Set(c.offers.flatMap((o) => o.codes))];
  return (
    <article className="sd-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="sd-badge violet">{c.brand}</span>
        <span className={`sd-badge ${st.cls}`}>{st.label}</span>
        {c.state === "aktif" && left != null && <span className={`sd-badge ${left <= 7 ? "red" : left <= 21 ? "amber" : "slate"}`}>Sisa {left} hari</span>}
        {c.state === "aktif" && left == null && <span className="sd-badge slate">s/d further notice</span>}
      </div>
      <h3 className="mt-2 text-base leading-snug font-black text-slate-950 dark:text-white">{c.title}</h3>
      <p className="mt-0.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
        {c.start && c.end ? `${day(c.start)} – ${day(c.end)}` : c.start ? `Mulai ${day(c.start)} · s/d further notice` : c.period}
      </p>
      <p className="mt-1 text-xs text-slate-500">{c.br}</p>
      {codes.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{codes.map((k) => <code key={k} className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">MOP {k}</code>)}</div>}
      {c.mismatches.length > 0 && (
        <details className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <summary className="flex cursor-pointer items-center gap-1.5 font-semibold"><AlertTriangle className="size-3.5 shrink-0" /> Harga {c.mismatches.length} tipe di file beda dengan Price List — dipakai harga Price List</summary>
          <ul className="mt-1 space-y-0.5">{c.mismatches.map((x) => <li key={x.name}>{x.name}: file {rp(x.file)} · Price List <b>{rp(x.list)}</b></li>)}</ul>
        </details>
      )}

      <label className="mt-3 block text-xs font-bold text-slate-500" htmlFor={`pwp-${c.id}`}>Tipe HP ({c.models.length})</label>
      <select id={`pwp-${c.id}`} className="sd-input mt-1 w-full" value={mi} onChange={(e) => setPick(Number(e.target.value))}>
        {c.models.map((x, i) => <option key={`${x.name}-${x.price}`} value={i}>{x.name} · {rp(x.price)}</option>)}
      </select>
      {m && (
        <>
          <p className="mt-1.5 text-xs text-slate-500">
            Harga HP <b className="text-slate-800 dark:text-slate-100">{rp(m.price)}</b>{m.listed ? " (Price List)" : " (dari file, tidak ada di Price List)"}
            {c.soh.models[mi] != null && <> · <span className={c.soh.models[mi]! > 0 ? "" : "font-bold text-rose-600"}>SOH {c.soh.models[mi]}</span></>}
            {m.colors.length > 0 && <> · {m.colors.join(", ").toLowerCase()}</>}
          </p>
          <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-[12.5px]">
              <thead className="bg-slate-50 text-left text-[11px] tracking-wide text-slate-500 uppercase dark:bg-slate-800/60">
                <tr><th className="px-3 py-2">Aksesoris</th><th className="px-2 py-2 text-right">Harga</th><th className="px-2 py-2 text-right">Cashback</th><th className="px-3 py-2 text-right">Bayar total</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {rows.map(({ oi, o, acc, nett }) => {
                  const hitRow = terms.length > 0 && hasAll(terms, o.items.map((i) => `${i.description} ${i.articles.join(" ")}`).join(" ").toUpperCase());
                  return (
                    <tr key={oi} className={hitRow ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                      <td className="px-3 py-1.5">
                        {o.items.map((it, k) => {
                          const soh = c.soh.items[oi]?.[k];
                          return (
                            <span key={k} className="block">
                              {k > 0 && <b className="text-slate-400">+ </b>}{it.description}
                              {soh != null && <span className={`ml-1 text-[10px] font-bold ${soh > 0 ? "text-slate-500" : "text-rose-500"}`}>SOH {soh}</span>}
                              {it.listed && it.price !== it.filePrice && <span className="ml-1 text-[10px] text-amber-600">(file {rp(it.filePrice)})</span>}
                            </span>
                          );
                        })}
                        {o.codes.length > 0 && <code className="text-[10px] font-bold text-slate-500">MOP {o.codes.join(", ")}</code>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{rp(acc)}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-emerald-700 tabular-nums dark:text-emerald-400">{nett <= 0 ? "Gratis" : `−${rp(o.cashback)}`}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums"><b>{rp(m.price + nett)}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">Bayar total = harga HP + aksesoris − cashback. Harga mengikuti Price List & Price List Aksesoris terbaru.</p>
        </>
      )}
    </article>
  );
}
