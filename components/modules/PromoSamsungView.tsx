"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { EmptyBlock } from "@/components/kit";
import { CATEGORIES, SERIES, categoryOf, type PromoState } from "@/lib/domain/samsungPromo";
import type { PromoKind, PromoRange } from "@/types/samsungPromo";

export interface PromoSheetCard {
  name: string;
  kind: PromoKind;
  notes: string[];
  articles: Array<{ article: string; description: string; value: number; code: string; normal: number | null; state: PromoState; ranges: PromoRange[]; soh: number | null }>;
  pairs: Array<{ article: string; description: string; soh: number | null }>;
}

export interface PromoCard {
  key: string;
  no: number;
  /** Series the promo covers (Galaxy Z, Galaxy S, Tab A, Watch, …); empty = other. */
  series: string[];
  type: string;
  name: string;
  period: string;
  ranges: PromoRange[];
  state: PromoState;
  mechanism: string;
  combine: string;
  /** Promo codes with their cashback (0 = value not in the file). */
  codes: Array<{ code: string; value: number }>;
  stores: string[];
  /** Limited to other stores than ours. */
  otherStore: boolean;
  sheets: PromoSheetCard[];
}

const nf = new Intl.NumberFormat("id-ID");
const rp = (n: number) => `Rp${nf.format(n)}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const day = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const rangeText = (rs: PromoRange[]) => rs.map((r) => (r.from === r.to ? day(r.from) : `${day(r.from)} – ${day(r.to)}`)).join(" · ");
const STATE: Record<PromoState, { cls: string; label: string }> = { aktif: { cls: "green", label: "Aktif" }, akan: { cls: "blue", label: "Akan datang" }, selesai: { cls: "slate", label: "Selesai" } };
const FILTERS = [
  { key: "", label: "Aktif hari ini" },
  { key: "akan", label: "Akan datang" },
  { key: "all", label: "Semua" },
] as const;

function syncUrl(patch: Record<string, string | null>) {
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  window.history.replaceState(window.history.state, "", u);
}

const has = (terms: string[], s: string) => terms.every((t) => s.includes(t));

/**
 * Promo Samsung: one card per promo of the summary sheet, with the articles, PWP pair items and
 * terms of its detail sheet(s). Filter by state, search by type / article / code / PWP pair.
 */
const OTHER = "Lainnya";
const catsOf = (c: PromoCard) => (c.series.length ? [...new Set(c.series.map((x) => categoryOf(x)!))] : [OTHER]);

export function PromoSamsungView({ cards, store, today, hasSoh, initialFilter, initialCat, initialSeries, initialSearch }: { cards: PromoCard[]; store: string; today: string; hasSoh: boolean; initialFilter: string; initialCat: string; initialSeries: string; initialSearch: string }) {
  const [filter, setFilter] = useState(FILTERS.some((f) => f.key === initialFilter) ? initialFilter : "");
  const [cat, setCat] = useState<string>([...CATEGORIES, OTHER].includes(initialCat as never) ? initialCat : "");
  const [series, setSeries] = useState<string>(SERIES.some((x) => x.key === initialSeries) ? initialSeries : "");
  const [search, setSearch] = useState(initialSearch);
  const q = useDeferredValue(search);
  const terms = q.toUpperCase().split(/\s+/).filter(Boolean);

  const shown = useMemo(() => {
    const byState = cards.filter(
      (c) =>
        (filter === "all" ? true : filter === "akan" ? c.state === "akan" : c.state === "aktif" && !c.otherStore) &&
        (!cat || catsOf(c).includes(cat as never)) &&
        (!series || c.series.includes(series)),
    );
    if (!terms.length) return byState.map((c) => ({ c, pairHits: 0 }));
    return byState
      .map((c) => {
        const head = `${c.type} ${c.name} ${c.codes.map((k) => k.code).join(" ")} ${c.mechanism}`.toUpperCase();
        const arts = c.sheets.some((s) => s.articles.some((a) => has(terms, `${a.article} ${a.description} ${a.code}`.toUpperCase())));
        const pairHits = c.sheets.reduce((n, s) => n + s.pairs.filter((p) => has(terms, `${p.article} ${p.description}`.toUpperCase())).length, 0);
        return { c, pairHits, ok: has(terms, head) || arts || pairHits > 0 };
      })
      .filter((x) => x.ok);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, filter, cat, series, q]);

  const inState = (c: PromoCard, k = filter) => (k === "all" ? true : k === "akan" ? c.state === "akan" : c.state === "aktif" && !c.otherStore);
  const count = (k: string) => cards.filter((c) => inState(c, k) && (!cat || catsOf(c).includes(cat as never)) && (!series || c.series.includes(series))).length;
  const catCount = (k: string) => cards.filter((c) => inState(c) && (!k || catsOf(c).includes(k as never))).length;
  const seriesCount = (k: string) => cards.filter((c) => inState(c) && (k ? c.series.includes(k) : !cat || catsOf(c).includes(cat as never))).length;
  const cats = [...CATEGORIES, OTHER].filter((k) => cards.some((c) => catsOf(c).includes(k as never)));
  const seriesList = cat && cat !== OTHER ? SERIES.filter((x) => x.category === cat && cards.some((c) => c.series.includes(x.key))) : [];
  const pickCat = (k: string) => {
    setCat(k);
    setSeries("");
    syncUrl({ c: k || null, r: null });
  };
  const pickSeries = (k: string) => {
    setSeries(k);
    syncUrl({ r: k || null });
  };
  // grouped by the first series each promo covers (series order: Z, S, A, Tab S, Tab A, Watch, Buds)
  const groups = useMemo(() => {
    const order = [...SERIES.map((x) => x.key), OTHER];
    const m = new Map<string, typeof shown>();
    for (const x of shown) {
      const first = series || (cat && cat !== OTHER ? x.c.series.find((k) => categoryOf(k) === cat) : x.c.series[0]) || OTHER;
      m.set(first, [...(m.get(first) ?? []), x]);
    }
    return [...m.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [shown, series, cat]);

  return (
    <>
      <form className="sd-panel flex items-center gap-2 p-3 sm:p-4" role="search" onSubmit={(e) => e.preventDefault()}>
        <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
        <input value={search} onChange={(e) => { setSearch(e.target.value); syncUrl({ s: e.target.value.trim() || null }); }} className="sd-input flex-1" placeholder="Cari tipe, kode promo, atau barang pasangan PWP…" aria-label="Cari promo" />
        {search && <button type="button" className="sd-btn" onClick={() => { setSearch(""); syncUrl({ s: null }); }} aria-label="Hapus pencarian"><X className="size-4" /></button>}
      </form>

      <section className="sd-panel space-y-2 p-2.5 sm:p-3" aria-label="Kategori & seri">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {["", ...cats].map((k) => (
            <button key={k || "all"} type="button" aria-pressed={cat === k} onClick={() => pickCat(k)} className={`rounded-xl px-2.5 py-1.5 text-xs font-bold sm:px-4 sm:py-2 sm:text-sm ${cat === k ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300"}`}>
              {k || "Semua kategori"} <span className="opacity-70">{catCount(k)}</span>
            </button>
          ))}
        </div>
        {seriesList.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-t border-slate-200 pt-2 sm:gap-2 dark:border-slate-700">
            {[{ key: "" }, ...seriesList].map((x) => (
              <button key={x.key || "all"} type="button" aria-pressed={series === x.key} onClick={() => pickSeries(x.key)} className={`rounded-xl px-2.5 py-1 text-xs font-semibold sm:px-3 sm:py-1.5 ${series === x.key ? "bg-slate-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                {x.key || `Semua ${cat}`} <span className="opacity-70">{seriesCount(x.key)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="sd-panel flex flex-wrap gap-1.5 p-2.5 sm:gap-2 sm:p-3" aria-label="Filter promo">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); syncUrl({ f: f.key || null }); }} className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm ${filter === f.key ? "bg-slate-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
            {f.label} <span className="opacity-70">{count(f.key)}</span>
          </button>
        ))}
      </section>

      {shown.length ? (
        groups.map(([g, list]) => (
          <section key={g} className="space-y-3">
            <h2 className="px-1 text-sm font-black tracking-wide text-slate-500 uppercase">{g} <span className="font-semibold normal-case">· {list.length} promo</span></h2>
            <div className="grid gap-4 xl:grid-cols-2">
              {list.map(({ c, pairHits }) => <Card key={c.key} c={c} store={store} today={today} hasSoh={hasSoh} terms={terms} pairHits={pairHits} />)}
            </div>
          </section>
        ))
      ) : (
        <div className="sd-panel p-5"><EmptyBlock title="Tidak ada promo" need={false}>{terms.length ? "Tidak ada promo yang cocok dengan pencarian." : filter === "akan" ? "Tidak ada promo yang akan dimulai." : "Tidak ada promo aktif hari ini."}</EmptyBlock></div>
      )}
    </>
  );
}

function Card({ c, store, today, hasSoh, terms, pairHits }: { c: PromoCard; store: string; today: string; hasSoh: boolean; terms: string[]; pairHits: number }) {
  const st = STATE[c.state];
  const ranges = c.ranges.length ? rangeText(c.ranges) : c.period;
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 864e5).toISOString().slice(0, 10);
  // ends within 2 days and no later range follows
  const endsSoon = c.state === "aktif" && c.ranges.some((r) => r.from <= today && today <= r.to && r.to <= soon) && !c.ranges.some((r) => r.from > today);
  return (
    <article className={`sd-panel p-4 sm:p-5 ${c.otherStore ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="sd-badge violet">{c.type}</span>
        <span className={`sd-badge ${st.cls}`}>{st.label}</span>
        {c.series.length > 1 && <span className="sd-badge slate">{c.series.join(" · ")}</span>}
        {endsSoon && <span className="sd-badge amber">Segera berakhir</span>}
        {c.stores.length > 0 && <span className={`sd-badge ${c.otherStore ? "red" : "slate"}`}>Khusus {c.stores.join(", ")}{c.otherStore && store ? ` · bukan ${store}` : ""}</span>}
      </div>
      <h3 className="mt-2 text-base leading-snug font-black text-slate-950 dark:text-white">{c.name}</h3>
      {ranges && <p className="mt-0.5 text-sm font-semibold text-slate-600 dark:text-slate-300">{ranges}</p>}
      {c.codes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">{c.codes.map((k) => <code key={`${k.code}-${k.value}`} className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{k.code}{k.value ? <span className="font-semibold text-emerald-700 dark:text-emerald-400"> · {rp(k.value)}</span> : null}</code>)}</div>
      )}
      {c.mechanism && <p className="mt-2 text-[13px] whitespace-pre-line text-slate-600 dark:text-slate-300">{c.mechanism}</p>}
      {c.combine && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><b>Penggabungan:</b> {c.combine}</p>}

      {c.sheets.map((s) => (
        <div key={s.name} className="mt-3 space-y-2">
          {s.pairs.length > 0 && (
            <details open={pairHits > 0} className="rounded-2xl border border-slate-200 dark:border-slate-700">
              <summary className="cursor-pointer px-3 py-2 text-sm font-bold">{s.pairs.length} barang pasangan PWP{pairHits ? <span className="ml-1 text-amber-600">· {pairHits} cocok</span> : null}</summary>
              <ul className="grid gap-x-4 border-t border-slate-200 px-3 py-2 text-[12.5px] sm:grid-cols-2 dark:border-slate-700">
                {s.pairs.map((p, i) => {
                  const hit = terms.length > 0 && has(terms, `${p.article} ${p.description}`.toUpperCase());
                  return (
                    <li key={`${p.article}-${i}`} className={`flex justify-between gap-2 py-1 ${hit ? "font-bold text-amber-700 dark:text-amber-300" : ""}`}>
                      <span className="min-w-0">{p.description || p.article}</span>
                      {hasSoh && p.soh !== null && <span className={`shrink-0 text-[10px] font-bold ${p.soh > 0 ? "text-slate-500" : "text-rose-500"}`}>SOH {p.soh}</span>}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          {s.notes.length > 0 && (
            <details className="rounded-2xl border border-slate-200 dark:border-slate-700">
              <summary className="cursor-pointer px-3 py-2 text-sm font-bold">Syarat & ketentuan</summary>
              <div className="space-y-1 border-t border-slate-200 px-3 py-2 text-[12.5px] text-slate-600 dark:border-slate-700 dark:text-slate-300">{s.notes.map((n, i) => <p key={i}>{n}</p>)}</div>
            </details>
          )}
        </div>
      ))}
    </article>
  );
}
