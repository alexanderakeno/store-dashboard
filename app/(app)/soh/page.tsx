import Link from "next/link";
import { EmptyBlock, PageIntro, Panel } from "@/components/kit";
import { RetryButton } from "@/components/kit/RetryButton";
import { PageStatus } from "@/components/layout/PageStatus";
import { SohView } from "@/components/modules/SohView";
import { sohRows } from "@/lib/domain/soh";
import { dmy, timeAgo } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { getSoh } from "@/lib/soh";
import type { SohSnapshot } from "@/types/soh";

export default async function SohPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="SOH" p={p} />;
  const manage = <Link href="/upload#soh" prefetch={false} className="sd-btn">Kelola SOH</Link>;
  const intro = "SOH per kategori dari PDF Sales Dashboard V6 · Qty Sold dari Sales Person.";

  let soh: SohSnapshot | null;
  try {
    soh = await getSoh();
  } catch (e) {
    // a failed read is NOT "no data" — say so and offer a retry
    return (
      <div className="sd-content">
        <PageIntro title="Stock On Hand" desc={intro} actions={manage} />
        <Panel>
          <div className="space-y-3" role="alert">
            <EmptyBlock title="SOH gagal dimuat" need={false}>Google Sheet (tab APP_SOH) tidak bisa dibaca saat ini: {(e as Error).message}</EmptyBlock>
            <div className="flex justify-center"><RetryButton /></div>
          </div>
        </Panel>
      </div>
    );
  }
  if (!soh) {
    return (
      <div className="sd-content">
        <PageIntro title="Stock On Hand" desc={intro} actions={manage} />
        <Panel><EmptyBlock title="Data SOH">Belum ada SOH. Upload PDF Stock On Hand di Data Upload → Import SOH.</EmptyBlock></Panel>
      </div>
    );
  }

  return (
    <div className="sd-content">
      <PageIntro
        title="Stock On Hand"
        desc={`Update stok ${soh.date ? dmy(soh.date) : "–"} · diimport ${soh.updatedAt ? timeAgo(Date.parse(soh.updatedAt)) : "–"} · Qty Sold dari Sales Person s/d ${dmy(p.asOf)}.`}
        actions={manage}
      />
      <SohView categories={soh.categories} rows={sohRows(soh.items, p.snap.lines, p.asOf)} initialCat={p.q.cat ?? ""} initialSearch={(p.q.s ?? "").trim()} />
    </div>
  );
}
