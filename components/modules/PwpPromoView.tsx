"use client";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Search, Upload, X } from "lucide-react";
import { EmptyBlock } from "@/components/kit";
import { pwpShortTitle, type PwpView } from "@/lib/domain/pwpPromo";
import { PwpPromoForm } from "./PwpPromoForm";

/** A program as the page sends it: the view plus SOH per model / accessory (null = SOH not read). */
export type PwpCard = PwpView & { soh: { models: Array<number | null>; items: Array<Array<number | null>> } };

const nf = new Intl.NumberFormat("id-ID");
const rp = (n: number) => `Rp${nf.format(Math.round(n))}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const day = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

const words = (s: string) => s.toUpperCase().split(/\s+/).filter(Boolean);
const hasAll = (terms: string[], text: string) => terms.every((t) => text.includes(t));
/** Every word in the same place: the title, one device model, or one accessory / bundle. */
const matches = (c: PwpCard, terms: string[]) =>
  !terms.length ||
  [`${c.title} ${c.brand} ${c.br}`, ...c.models.map((m) => `${m.name} ${m.colors.join(" ")} ${m.articles.join(" ")}`), ...c.offers.map((o) => `${o.items.map((i) => `${i.description} ${i.articles.join(" ")}`).join(" ")} ${o.codes.join(" ")}`)].some((t) => hasAll(terms, t.toUpperCase()));

const endText = (c: PwpCard) => (c.state === "akan" && c.start ? `Mulai ${day(c.start)}` : c.end ? `s/d ${day(c.end)}` : "s/d further notice");
const tone = (left: number | null) => (left == null ? "text-slate-500" : left <= 7 ? "text-rose-600" : left <= 21 ? "text-amber-600" : "text-slate-500");

/** PWP promos per brand: a tile per brand, its promos in a pop-up with the price per device and accessory. */
export function PwpPromoView({ cards, isAdmin, current, initialSearch, initialBrand }: { cards: PwpCard[]; isAdmin: boolean; current: string | null; initialSearch: string; initialBrand: string }) {
  const [search, setSearch] = useState(initialSearch);
  const [open, setOpen] = useState(initialBrand);
  const [upload, setUpload] = useState(false);
  const q = useDeferredValue(search);
  const terms = useMemo(() => words(q), [q]);

  const syncUrl = (patch: Record<string, string | null>) => {
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries(patch)) v ? u.searchParams.set(k, v) : u.searchParams.delete(k);
    window.history.replaceState(null, "", u);
  };
  const live = cards.filter((c) => c.state !== "selesai" && matches(c, terms));
  const brands = useMemo(() => {
    const m = new Map<string, PwpCard[]>();
    for (const c of live) m.set(c.brand, [...(m.get(c.brand) ?? []), c]);
    return [...m.entries()].map(([brand, list]) => ({ brand, list: list.sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9)) })).sort((a, b) => a.brand.localeCompare(b.brand));
  }, [live]);
  const pick = (b: string) => {
    setOpen(b);
    syncUrl({ b: b || null });
  };
  const opened = brands.find((b) => b.brand === open);

  return (
    <>
      <form className="sd-panel flex items-center gap-2 p-3 sm:p-4" role="search" onSubmit={(e) => e.preventDefault()}>
        <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
        <input value={search} onChange={(e) => { setSearch(e.target.value); syncUrl({ s: e.target.value.trim() || null }); }} className="sd-input min-w-0 flex-1" placeholder="Cari tipe HP atau aksesoris…" aria-label="Cari promo PWP" />
        {search && <button type="button" className="sd-btn !px-2.5" onClick={() => { setSearch(""); syncUrl({ s: null }); }} aria-label="Hapus pencarian"><X className="size-4" /></button>}
        {isAdmin && <button type="button" className="sd-btn !px-2.5" aria-expanded={upload} onClick={() => setUpload((x) => !x)} title="Upload file PWP terbaru"><Upload className="size-4" /><span className="hidden sm:inline">Upload</span></button>}
      </form>
      {isAdmin && upload && <section className="sd-panel p-4"><PwpPromoForm current={current} onDone={() => setUpload(false)} /></section>}

      {brands.length ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {brands.map(({ brand, list }) => {
            const soon = list.find((c) => c.state === "aktif" && c.daysLeft != null);
            return (
              <button key={brand} type="button" onClick={() => pick(brand)} aria-haspopup="dialog" className="sd-panel flex flex-col items-start gap-1 p-4 text-left transition hover:ring-2 hover:ring-blue-500/40">
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-base font-black text-slate-950">{brand}</span>
                  <ChevronRight className="size-4 shrink-0 text-slate-400" />
                </span>
                <span className="text-xs font-semibold text-slate-500">{list.length} promo · {list.reduce((a, c) => a + c.models.length, 0)} tipe</span>
                {soon && <span className={`text-[11px] font-bold ${tone(soon.daysLeft)}`}>Terdekat berakhir {day(soon.end!)}{soon.daysLeft! <= 21 ? ` · ${soon.daysLeft} hari` : ""}</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="sd-panel p-5"><EmptyBlock title="Tidak ada promo PWP" need={false}>{terms.length ? "Tidak ada promo yang cocok dengan pencarian." : "Belum ada promo PWP aktif."}</EmptyBlock></div>
      )}
      <p className="px-1 text-xs text-slate-500">Promo PWP Samsung ada di menu Promo Samsung.</p>

      {opened && <BrandDialog brand={opened.brand} list={opened.list} terms={terms} onClose={() => pick("")} />}
    </>
  );
}

function BrandDialog({ brand, list, terms, onClose }: { brand: string; list: PwpCard[]; terms: string[]; onClose: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(list.length === 1 || terms.length ? list[0].id : null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    const body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = body;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Promo PWP ${brand}`} className="sd-panel flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-b-none sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="flex-1 text-base font-black text-slate-950">Promo PWP {brand} <span className="text-sm font-semibold text-slate-500">· {list.length}</span></h3>
          <button type="button" className="sd-btn ghost !p-1.5" onClick={onClose} aria-label="Tutup"><X className="size-5" /></button>
        </div>
        <ul className="divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {list.map((c) => {
            const isOpen = expanded === c.id;
            return (
              <li key={c.id}>
                <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : c.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug font-bold text-slate-900 dark:text-slate-100">{pwpShortTitle(c.title, brand)}</span>
                    <span className={`block text-xs font-semibold ${tone(c.daysLeft)}`}>{endText(c)}{c.state === "aktif" && c.daysLeft != null ? ` · ${c.daysLeft} hari lagi` : ""}</span>
                  </span>
                  <ChevronDown className={`size-4 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && <Program c={c} terms={terms} />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Program({ c, terms }: { c: PwpCard; terms: string[] }) {
  // a search that names a model opens that model
  const hit = terms.length ? c.models.findIndex((m) => hasAll(terms, `${m.name} ${m.colors.join(" ")} ${m.articles.join(" ")}`.toUpperCase())) : -1;
  const [pick, setPick] = useState<number | null>(null);
  const mi = pick ?? Math.max(0, hit);
  const m = c.models[mi];
  const rows = (m?.offers ?? [])
    .map((oi) => {
      const o = c.offers[oi];
      const acc = o.items.reduce((a, it) => a + it.price, 0);
      return { oi, o, acc, nett: acc - o.cashback };
    })
    .sort((a, b) => a.nett - b.nett || a.o.items[0].description.localeCompare(b.o.items[0].description));
  const codes = [...new Set(c.offers.flatMap((o) => o.codes))];
  const mismatch = m && m.listed && m.filePrice !== m.price;
  return (
    <div className="space-y-2 bg-slate-50/70 px-4 pt-1 pb-4 dark:bg-slate-900/40">
      <select className="sd-input w-full" value={mi} onChange={(e) => setPick(Number(e.target.value))} aria-label="Tipe HP">
        {c.models.map((x, i) => <option key={`${x.name}-${x.price}`} value={i}>{x.name} · {rp(x.price)}</option>)}
      </select>
      {m && (
        <p className="text-xs text-slate-500">
          HP <b className="text-slate-800 dark:text-slate-100">{rp(m.price)}</b>
          {!m.listed && " (harga file)"}
          {c.soh.models[mi] != null && <> · <span className={c.soh.models[mi]! > 0 ? "" : "font-bold text-rose-600"}>SOH {c.soh.models[mi]}</span></>}
          {codes.length > 0 && <> · MOP <b>{codes.join(", ")}</b></>}
        </p>
      )}
      {mismatch && <p className="flex items-start gap-1 text-[11px] text-amber-700"><AlertTriangle className="mt-px size-3 shrink-0" />Di file tertulis {rp(m.filePrice)} — dipakai harga Price List.</p>}
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
        {rows.map(({ oi, o, acc, nett }) => (
          <li key={oi} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-snug font-semibold text-slate-800 dark:text-slate-100">
                {o.items.map((it) => it.description).join(" + ")}
                {o.items.map((_, k) => c.soh.items[oi]?.[k]).filter((x) => x != null).length > 0 && (
                  <span className={`ml-1 text-[10px] font-bold ${o.items.every((_, k) => (c.soh.items[oi]?.[k] ?? 0) > 0) ? "text-slate-400" : "text-rose-500"}`}>SOH {o.items.map((_, k) => c.soh.items[oi]?.[k] ?? "-").join("/")}</span>
                )}
              </span>
              <span className="block text-[11px] text-slate-500">
                {rp(acc)} · {nett <= 0 ? <b className="text-emerald-700 dark:text-emerald-400">gratis</b> : <span className="text-emerald-700 dark:text-emerald-400">cashback {rp(o.cashback)}</span>}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[10px] font-semibold text-slate-400 uppercase">Bayar</span>
              <b className="text-sm text-slate-950 tabular-nums">{rp(m.price + Math.max(0, nett))}</b>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
