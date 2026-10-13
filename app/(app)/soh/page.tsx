import Link from "next/link";
import { Search } from "lucide-react";
import { EmptyBlock, PageIntro, Panel } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { LOW_DAYS, SLOW_DAYS, sohRows, type SohRow } from "@/lib/domain/soh";
import { dmy, num, timeAgo } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";
import { getSoh } from "@/lib/soh";

const BALANCE: Record<SohRow["balance"], { cls: string; label: (r: SohRow) => string }> = {
  low: { cls: "red", label: (r) => `Stok tipis · ~${Math.max(1, Math.round(r.coverDays!))} hari` },
  ok: { cls: "green", label: (r) => `Aman · ~${Math.round(r.coverDays!)} hari` },
  slow: { cls: "amber", label: (r) => `Lambat · ~${Math.round(r.coverDays!)} hari` },
  unsold: { cls: "slate", label: () => "Belum terjual" },
};

export default async function SohPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="SOH" p={p} />;
  const soh = await getSoh();
  const manage = <Link href="/upload#soh" className="sd-btn">Kelola SOH</Link>;
  if (!soh) {
    return (
      <div className="sd-content">
        <PageIntro title="Stock On Hand" desc="SOH per kategori dari PDF Sales Dashboard V6 · Qty Sold dari Sales Person." actions={manage} />
        <Panel><EmptyBlock title="Data SOH">Belum ada SOH. Upload PDF Stock On Hand di Data Upload → Import SOH.</EmptyBlock></Panel>
      </div>
    );
  }

  const search = (p.q.s ?? "").trim();
  const cat = soh.categories.includes(p.q.cat ?? "") ? p.q.cat! : soh.categories[0];
  const all = sohRows(soh.items, p.snap.lines, p.asOf);
  const terms = search.toUpperCase().split(/\s+/).filter(Boolean);
  const match = (r: SohRow) => terms.every((t) => `${r.article} ${r.description}`.toUpperCase().includes(t));
  // searching looks across every category; otherwise only the selected one
  const rows = terms.length ? all.filter(match) : all.filter((r) => r.category === cat);
  const totSoh = rows.reduce((a, r) => a + r.qty, 0);
  const totSold = rows.reduce((a, r) => a + r.sold, 0);
  const keep = Object.entries(p.q).filter(([k]) => k !== "s" && k !== "cat");

  return (
    <div className="sd-content">
      <PageIntro
        title="Stock On Hand"
        desc={`Update stok ${soh.date ? dmy(soh.date) : "–"} · diimport ${soh.updatedAt ? timeAgo(Date.parse(soh.updatedAt)) : "–"} · Qty Sold dari Sales Person s/d ${dmy(p.asOf)}.`}
        actions={manage}
      />
      <form action="/soh" method="get" className="sd-panel flex items-center gap-2 p-4">
        {keep.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {!terms.length && <input type="hidden" name="cat" value={cat} />}
        <input name="s" defaultValue={search} className="sd-input flex-1" placeholder="Cari Article atau Description…" aria-label="Cari SOH" />
        <button type="submit" className="sd-btn" aria-label="Cari"><Search className="size-4" /></button>
        {search && <Link href={withQuery("/soh", p.q, { s: null })} className="sd-btn">Reset</Link>}
      </form>
      {!terms.length && (
        <section className="sd-panel flex flex-wrap gap-2 p-3">
          {soh.categories.map((c) => (
            <Link key={c} href={withQuery("/soh", p.q, { cat: c, s: null })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${c === cat ? "bg-slate-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
              {c} <span className="opacity-70">{num(soh.items.filter((x) => x.category === c).reduce((a, x) => a + x.qty, 0))}</span>
            </Link>
          ))}
        </section>
      )}
      <Panel
        title={terms.length ? `Hasil cari "${search}"` : cat}
        desc={terms.length ? `${rows.length} artikel di semua kategori.` : `Balance: stok ÷ rata-rata terjual per hari bulan ini (< ${LOW_DAYS} hari = tipis, > ${SLOW_DAYS} hari = lambat).`}
      >
        <div className="mb-3 flex gap-2"><span className="sd-badge blue">SOH {num(totSoh)}</span><span className="sd-badge slate">Sold {num(totSold)}</span><span className="sd-badge slate">{rows.length} artikel</span></div>
        <div className="sd-table-wrap"><table className="sd-table">
          <thead><tr><th>Article</th><th>Description</th>{terms.length ? <th>Kategori</th> : null}<th className="n">Qty SOH</th><th className="n">Qty Sold</th><th>Balance View</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={`${r.category}|${r.article}`}>
                <td className="font-mono text-xs">{r.article}</td>
                <td>{r.description}</td>
                {terms.length ? <td>{r.category}</td> : null}
                <td className="n">{num(r.qty)}</td>
                <td className="n">{num(r.sold)}</td>
                <td><span className={`sd-badge ${BALANCE[r.balance].cls}`}>{BALANCE[r.balance].label(r)}</span></td>
              </tr>
            )) : <tr><td colSpan={terms.length ? 6 : 5}><EmptyBlock title="Tidak ada artikel" need={false}>{terms.length ? "Tidak ada Article/Description yang cocok." : "Kategori ini kosong."}</EmptyBlock></td></tr>}
          </tbody>
          <tfoot><tr><td>TOTAL</td><td />{terms.length ? <td /> : null}<td className="n">{num(totSoh)}</td><td className="n">{num(totSold)}</td><td /></tr></tfoot>
        </table></div>
      </Panel>
    </div>
  );
}
