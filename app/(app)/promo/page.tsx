import { EmptyBlock, PageIntro, Panel } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { monthLabel } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";
import Link from "next/link";

export default async function PromoPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Promo Board" p={p} />;
  const promo = p.snap.extras.promo ?? [];
  const q = (p.q.q ?? "").toLowerCase();
  const brand = p.q.brand ?? "";
  const shown = promo
    .filter((b) => !brand || b.brand === brand)
    .map((b) => ({ ...b, items: b.items.filter((i) => !q || `${b.brand} ${i.promo} ${i.note}`.toLowerCase().includes(q)) }))
    .filter((b) => b.items.length);
  return (
    <div className="sd-content">
      <PageIntro title="Promo Board" desc={`Promo aktif per brand · sumber: tab Rekap Promo (${monthLabel(p.month)}).`} />
      {!promo.length ? (
        <EmptyBlock title="Tab Rekap Promo tidak ditemukan / kosong">Tambahkan tab &quot;Rekap Promo&quot; (nama brand di atas pasangan kolom Promo | Keterangan) di file bulanan.</EmptyBlock>
      ) : (
        <>
          <section className="sd-panel flex flex-wrap gap-2 p-3">
            <Link href={withQuery("/promo", p.q, { brand: null })} className="sd-pill !py-1.5 text-sm" aria-current={!brand ? "true" : undefined}>Semua ({promo.reduce((a, b) => a + b.items.length, 0)})</Link>
            {promo.map((b) => <Link key={b.brand} href={withQuery("/promo", p.q, { brand: b.brand })} className="sd-pill !py-1.5 text-sm" aria-current={brand === b.brand ? "true" : undefined}>{b.brand} ({b.items.length})</Link>)}
          </section>
          <div className="columns-1 gap-5 md:columns-2 xl:columns-3 [&>*]:mb-5 [&>*]:break-inside-avoid">
            {shown.map((b) => (
              <Panel key={b.brand} title={b.brand}>
                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                  {b.items.map((i, k) => (
                    <li key={k} className="py-2.5">
                      <p className="text-sm font-bold text-slate-950">{i.promo}</p>
                      {i.note && <p className="text-sm text-slate-500">{i.note}</p>}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
