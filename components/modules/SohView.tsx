"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { EmptyBlock, Panel } from "@/components/kit";
import { LOW_DAYS, SLOW_DAYS, type SohRow } from "@/lib/domain/soh";

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const num = (n: number) => nf.format(n);

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
export function SohView({ categories, rows, initialCat, initialSearch }: { categories: string[]; rows: SohRow[]; initialCat: string; initialSearch: string }) {
  const [cat, setCat] = useState(categories.includes(initialCat) ? initialCat : categories[0]);
  const [search, setSearch] = useState(initialSearch);
  const q = useDeferredValue(search);

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0) + r.qty);
    return m;
  }, [rows]);
  const terms = q.toUpperCase().split(/\s+/).filter(Boolean);
  const shown = terms.length
    ? rows.filter((r) => terms.every((t) => `${r.article} ${r.description}`.toUpperCase().includes(t)))
    : rows.filter((r) => r.category === cat);
  const totSoh = shown.reduce((a, r) => a + r.qty, 0);
  const totSold = shown.reduce((a, r) => a + r.sold, 0);
  const searching = terms.length > 0;

  const pickCat = (c: string) => {
    setCat(c);
    setSearch("");
    syncUrl({ cat: c, s: null });
  };
  const onSearch = (v: string) => {
    setSearch(v);
    syncUrl({ s: v.trim() || null });
  };

  return (
    <>
      <form className="sd-panel flex items-center gap-2 p-4" role="search" onSubmit={(e) => e.preventDefault()}>
        <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
        <input value={search} onChange={(e) => onSearch(e.target.value)} className="sd-input flex-1" placeholder="Cari Article atau Description…" aria-label="Cari SOH" />
        {search && <button type="button" className="sd-btn" onClick={() => onSearch("")} aria-label="Hapus pencarian"><X className="size-4" /></button>}
      </form>
      {!searching && (
        <section className="sd-panel flex flex-wrap gap-2 p-3" role="tablist" aria-label="Kategori SOH">
          {categories.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={c === cat} onClick={() => pickCat(c)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${c === cat ? "bg-slate-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
              {c} <span className="opacity-70">{num(totals.get(c) ?? 0)}</span>
            </button>
          ))}
        </section>
      )}
      <Panel
        title={searching ? `Hasil cari "${q.trim()}"` : cat}
        desc={searching ? `${shown.length} artikel di semua kategori.` : `Balance: stok ÷ rata-rata terjual per hari bulan ini (< ${LOW_DAYS} hari = tipis, > ${SLOW_DAYS} hari = lambat).`}
      >
        <div className="mb-3 flex gap-2"><span className="sd-badge blue">SOH {num(totSoh)}</span><span className="sd-badge slate">Sold {num(totSold)}</span><span className="sd-badge slate">{shown.length} artikel</span></div>
        <div className="sd-table-wrap"><table className="sd-table">
          <thead><tr><th>Article</th><th>Description</th>{searching && <th>Kategori</th>}<th className="n">Qty SOH</th><th className="n">Qty Sold</th><th>Balance View</th></tr></thead>
          <tbody>
            {shown.length ? shown.map((r) => (
              <tr key={`${r.category}|${r.article}`}>
                <td className="font-mono text-xs">{r.article}</td>
                <td>{r.description}</td>
                {searching && <td>{r.category}</td>}
                <td className="n">{num(r.qty)}</td>
                <td className="n">{num(r.sold)}</td>
                <td><span className={`sd-badge ${BALANCE[r.balance].cls}`}>{BALANCE[r.balance].label(r)}</span></td>
              </tr>
            )) : <tr><td colSpan={searching ? 6 : 5}><EmptyBlock title="Tidak ada artikel" need={false}>{searching ? "Tidak ada Article/Description yang cocok." : "Kategori ini kosong."}</EmptyBlock></td></tr>}
          </tbody>
          <tfoot><tr><td>TOTAL</td><td />{searching && <td />}<td className="n">{num(totSoh)}</td><td className="n">{num(totSold)}</td><td /></tr></tfoot>
        </table></div>
      </Panel>
    </>
  );
}
