import Link from "next/link";
import { EmptyBlock, PageIntro, Panel } from "@/components/kit";
import { RetryButton } from "@/components/kit/RetryButton";
import { PageStatus } from "@/components/layout/PageStatus";
import { SohView } from "@/components/modules/SohView";
import { StockKosong } from "@/components/modules/StockKosong";
import { appConfig } from "@/config/app";
import { addDays, monthStart, prevMonth } from "@/lib/domain/period";
import { sohRows } from "@/lib/domain/soh";
import { emptyStock, fulfillmentText } from "@/lib/domain/stockKosong";
import { getMonthLines, resolveAsOf } from "@/lib/services/dashboard";
import { dmy, timeAgo } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { getSoh } from "@/lib/soh";
import type { SohSnapshot } from "@/types/soh";

/** Days of sales looked at for "Stock Kosong". */
const KOSONG_DAYS = 30;

function Tabs({ kosong, count }: { kosong: boolean; count?: number }) {
  return (
    <nav className="sd-tabs grid-cols-2" aria-label="Tampilan SOH">
      <Link href="/soh" prefetch={false} className="sd-tab" aria-current={!kosong ? "page" : undefined}>Stock</Link>
      <Link href="/soh?v=kosong" prefetch={false} className="sd-tab" aria-current={kosong ? "page" : undefined}>
        Stock Kosong{count ? <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] text-white">{count}</span> : null}
      </Link>
    </nav>
  );
}

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

  if (p.q.v === "kosong") {
    // last 30 days up to the latest sales date (crosses into last month early in the month)
    const to = resolveAsOf(p.snap);
    const from = addDays(to, -(KOSONG_DAYS - 1));
    let lines = p.snap.lines;
    let partial = false;
    if (from < monthStart(p.month)) {
      const prev = await getMonthLines(prevMonth(p.month)).catch(() => null);
      if (prev) lines = [...prev.lines, ...lines];
      else partial = true;
    }
    const groups = emptyStock(soh.items, soh.categories, lines, from, to);
    const meta = { store: appConfig().storeCode, from: partial ? monthStart(p.month) : from, to, sohDate: soh.date };
    const text: Record<string, string> = { "": fulfillmentText(groups, meta) };
    for (const g of groups) text[g.category] = fulfillmentText([g], meta);
    const range = `${dmy(meta.from)} – ${dmy(to)}`;
    return (
      <div className="sd-content">
        <PageIntro
          title="Stock On Hand"
          desc={`Need fulfillment: device yang terjual ${range} tapi kosong di SOH ${soh.date ? dmy(soh.date) : "terakhir"}. Aksesoris tidak termasuk (tidak ada di PDF SOH).`}
          actions={manage}
        />
        <Tabs kosong count={groups.reduce((a, g) => a + g.items.length, 0)} />
        {partial && <div className="alert warn">Data penjualan bulan lalu tidak tersedia — yang dihitung hanya mulai {dmy(monthStart(p.month))}.</div>}
        <StockKosong groups={groups} text={text} range={range} />
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
      <Tabs kosong={false} />
      <SohView categories={soh.categories} rows={sohRows(soh.items, p.snap.lines, p.asOf)} initialCat={p.q.cat ?? ""} initialSearch={(p.q.s ?? "").trim()} />
    </div>
  );
}
