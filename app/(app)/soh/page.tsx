import Link from "next/link";
import { EmptyBlock, NeedData, PageIntro, Panel } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";

const CATS = ["iPhone", "iPad", "Mac", "Apple Watch", "AirPods, Pencil & Keyboard", "Android", "Accessories"];

export default async function SohPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="SOH" p={p} />;
  const cat = CATS.includes(p.q.cat ?? "") ? p.q.cat! : CATS[0];
  return (
    <div className="sd-content">
      <PageIntro title="Stock On Hand" desc="SOH per kategori • Update stock: Need Data • Qty Sold dari Sales Person." actions={<Link href="/upload" className="sd-btn">Kelola SOH</Link>} />
      <section className="sd-panel p-4"><input className="sd-input" placeholder="Cari Article atau Description…" disabled /></section>
      <section className="sd-panel flex flex-wrap gap-2 p-3">
        {CATS.map((c) => <Link key={c} href={withQuery("/soh", p.q, { cat: c })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${c === cat ? "bg-slate-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{c}</Link>)}
      </section>
      <Panel title={cat} desc="Tampilan hanya kategori yang sedang dipilih." right={<NeedData />}>
        <div className="mb-3 flex gap-2"><span className="sd-badge slate">SOH —</span><span className="sd-badge slate">Sold —</span></div>
        <div className="sd-table-wrap"><table className="sd-table">
          <thead><tr><th>Article</th><th>Description</th><th className="n">Qty SOH</th><th className="n">Qty Sold</th><th>Balance View</th></tr></thead>
          <tbody><tr><td colSpan={5}><EmptyBlock title="Data SOH">Upload file SOH (export stok per artikel) — format file perlu disepakati dulu.</EmptyBlock></td></tr></tbody>
          <tfoot><tr><td>TOTAL</td><td /><td className="n">—</td><td className="n">—</td><td /></tr></tfoot>
        </table></div>
      </Panel>
    </div>
  );
}
