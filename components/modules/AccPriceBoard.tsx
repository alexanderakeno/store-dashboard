"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { unpackAcc, type AccRow, type AccTuple } from "@/lib/domain/accPrice";

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const rp = (n: number) => `Rp ${nf.format(Math.round(n))}`;
const PAGE = 60;

type Filter = "all" | "changed" | "promo" | "nolist";
const FILTERS: Array<{ key: Filter; label: string; test: (r: AccRow) => boolean }> = [
  { key: "all", label: "Semua", test: () => true },
  { key: "changed", label: "Harga berubah", test: (r) => r.price != null && r.current != null && r.price !== r.current },
  { key: "promo", label: "Di bawah SRP", test: (r) => r.price != null && r.srp != null && r.price < r.srp },
  { key: "nolist", label: "Tidak ada di price list", test: (r) => r.src !== "list" },
];

type Sort = "default" | "priceDesc" | "priceAsc" | "stock";

function PriceCell({ r, align = "right" }: { r: AccRow; align?: "right" | "left" }) {
  if (r.price == null) return <span className="text-sm font-semibold text-slate-400">Belum ada harga</span>;
  const below = r.srp != null && r.price < r.srp;
  // "dari Rp …" only when it says something the struck-through SRP does not
  const moved = r.current != null && r.current !== r.price && !(below && r.current === r.srp);
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p className="font-black whitespace-nowrap text-slate-950 tabular-nums">{rp(r.price)}</p>
      {below && <p className="text-xs whitespace-nowrap text-slate-400 tabular-nums line-through">{rp(r.srp!)}</p>}
      {moved && (
        <p className={`inline-flex items-center gap-0.5 text-[11px] font-bold whitespace-nowrap ${r.price! < r.current! ? "text-emerald-600" : "text-rose-600"}`}>
          {r.price! < r.current! ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />} dari {rp(r.current!)}
        </p>
      )}
      {r.src === "soh" && <p className="text-[11px] font-semibold text-amber-600">harga SOH</p>}
    </div>
  );
}

const Stock = ({ qty }: { qty: number | null }) => (qty == null ? <span className="text-slate-400">–</span> : qty > 0 ? <span className="font-bold tabular-nums">{qty}</span> : <span className="text-slate-400">0</span>);

/** Accessories price list: search, category / brand filter, price-change and promo filters, paged list. */
export function AccPriceBoard({ rows: packed, hasSoh }: { rows: AccTuple[]; hasSoh: boolean }) {
  const rows = useMemo(() => packed.map(unpackAcc), [packed]);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [cat, setCat] = useState("");
  const [brand, setBrand] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("default");
  const [limit, setLimit] = useState(PAGE);

  const count = (list: AccRow[], key: (r: AccRow) => string) => {
    const m = new Map<string, number>();
    for (const r of list) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const cats = useMemo(() => count(rows, (r) => r.category), [rows]);
  const test = FILTERS.find((f) => f.key === filter)!.test;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const brands = useMemo(() => count(rows.filter((r) => (!cat || r.category === cat) && test(r)), (r) => r.brand), [rows, cat, filter]);

  const terms = q.toUpperCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(() => {
    const out = rows.filter((r) => (!cat || r.category === cat) && (!brand || r.brand === brand) && test(r) && terms.every((t) => `${r.article} ${r.description} ${r.brand} ${r.category}`.toUpperCase().includes(t)));
    if (sort === "priceDesc") out.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    else if (sort === "priceAsc") out.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    else if (sort === "stock") out.sort((a, b) => (b.qty ?? 0) - (a.qty ?? 0));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cat, brand, filter, sort, q]);
  const page = shown.slice(0, limit);
  const reset = () => setLimit(PAGE);

  return (
    <section className="sd-panel space-y-4 p-4 sm:p-5">
      <form className="flex items-center gap-2" role="search" onSubmit={(e) => e.preventDefault()}>
        <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
        <input value={search} onChange={(e) => (setSearch(e.target.value), reset())} className="sd-input flex-1" placeholder="Cari artikel, nama, brand… (mis. UAG iPhone 17 Pro)" aria-label="Cari price list aksesoris" />
        {search && <button type="button" className="sd-btn" onClick={() => (setSearch(""), reset())} aria-label="Hapus pencarian"><X className="size-4" /></button>}
      </form>

      <div className="grid gap-2 sm:grid-cols-3">
        <select className="sd-input" value={cat} onChange={(e) => (setCat(e.target.value), setBrand(""), reset())} aria-label="Kategori">
          <option value="">Semua kategori ({rows.length})</option>
          {cats.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        <select className="sd-input" value={brand} onChange={(e) => (setBrand(e.target.value), reset())} aria-label="Brand">
          <option value="">Semua brand</option>
          {brands.map(([b, n]) => <option key={b} value={b}>{b} ({n})</option>)}
        </select>
        <select className="sd-input" value={sort} onChange={(e) => (setSort(e.target.value as Sort), reset())} aria-label="Urutkan">
          <option value="default">Urut: brand & kategori</option>
          <option value="priceDesc">Harga tertinggi</option>
          <option value="priceAsc">Harga terendah</option>
          {hasSoh && <option value="stock">Stok terbanyak</option>}
        </select>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filter harga">
        {FILTERS.map((f) => {
          const n = rows.filter((r) => (!cat || r.category === cat) && (!brand || r.brand === brand) && f.test(r)).length;
          if (f.key !== "all" && !n) return null;
          return (
            <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} onClick={() => (setFilter(f.key), reset())} className={`rounded-xl px-3 py-1.5 text-sm font-bold ${filter === f.key ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
              {f.label} <span className="ml-0.5 text-xs opacity-60">{n}</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs font-semibold text-slate-500">{shown.length} artikel{shown.length > page.length ? ` · menampilkan ${page.length}` : ""}</p>

      {/* phones: cards */}
      <ul className="divide-y divide-slate-200 md:hidden dark:divide-slate-700">
        {page.map((r) => (
          <li key={r.article} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm leading-snug font-bold text-slate-950">{r.description}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{r.brand} · {r.category} · <span className="font-mono">{r.article}</span></p>
              {hasSoh && <p className="mt-0.5 text-[11px] text-slate-500">Stok <Stock qty={r.qty} /></p>}
              {r.remark && <p className="mt-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">{r.remark}</p>}
            </div>
            <PriceCell r={r} />
          </li>
        ))}
      </ul>

      {/* tablet / desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] font-black tracking-[.08em] text-slate-500 uppercase dark:border-slate-700">
              <th className="py-2 pr-3">Artikel</th>
              <th className="py-2 pr-3">Brand · Kategori</th>
              {hasSoh && <th className="py-2 pr-3 text-right">Stok</th>}
              <th className="py-2 pr-3 text-right">Harga</th>
              <th className="py-2">Keterangan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {page.map((r) => (
              <tr key={r.article} className="align-top">
                <td className="py-2.5 pr-3">
                  <p className="font-bold text-slate-950">{r.description}</p>
                  <p className="font-mono text-[11px] text-slate-500">{r.article}</p>
                </td>
                <td className="py-2.5 pr-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{r.brand}<span className="block text-xs text-slate-400">{r.category}</span></td>
                {hasSoh && <td className="py-2.5 pr-3 text-right"><Stock qty={r.qty} /></td>}
                <td className="py-2.5 pr-3"><PriceCell r={r} /></td>
                <td className="max-w-[16rem] py-2.5 text-xs text-slate-500">{r.remark || (r.src === "soh" ? "Tidak ada di price list — harga dari SOH" : r.src === "none" ? "Tidak ada di price list" : "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!shown.length && <p className="py-6 text-center text-sm text-slate-500">Tidak ada artikel yang cocok.</p>}
      {shown.length > page.length && (
        <div className="flex justify-center">
          <button type="button" className="sd-btn" onClick={() => setLimit((l) => l + PAGE * 3)}>Tampilkan lebih banyak ({shown.length - page.length} lagi)</button>
        </div>
      )}
    </section>
  );
}
