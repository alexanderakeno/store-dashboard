import Link from "next/link";
import { EmptyBlock, PageIntro, Panel } from "@/components/kit";
import { RetryButton } from "@/components/kit/RetryButton";
import { PageStatus } from "@/components/layout/PageStatus";
import { SohView } from "@/components/modules/SohView";
import { StockKosong } from "@/components/modules/StockKosong";
import { appConfig } from "@/config/app";
import { monthStart, todayIn } from "@/lib/domain/period";
import { sohRows } from "@/lib/domain/soh";
import { skuPrices, type SkuPrices } from "@/lib/domain/skuPrice";
import { getPriceList } from "@/lib/pricelist";
import { getSamsungPromo } from "@/lib/samsungPromo";
import { etpPromos, exclusions, variantPromo } from "@/lib/domain/samsungPromo";
import { fulfillmentText } from "@/lib/domain/stockKosong";
import { dmy, timeAgo } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { getSoh, stockKosong } from "@/lib/soh";
import type { SohSnapshot } from "@/types/soh";

/**
 * Price list per SOH article (+ Samsung PWP / trade in / EIP / ETP per variant), memoised per
 * (price list, SOH, promo, day): the inputs are the cached objects, so it is computed once per data
 * refresh instead of on every view. The result is read-only.
 */
const priceMemo = new WeakMap<object, WeakMap<object, Map<string, SkuPrices>>>();
const NO_PROMO = {};
async function sohPrices(soh: SohSnapshot, today: string): Promise<SkuPrices> {
  const list = await getPriceList().catch(() => null);
  const hasSamsung = !!list?.items.some((x) => x.kind === "android" && /samsung/i.test(x.brand));
  const promo = hasSamsung ? await getSamsungPromo().catch(() => null) : null;
  const k1 = list ?? NO_PROMO;
  let a = priceMemo.get(k1);
  if (!a) priceMemo.set(k1, (a = new WeakMap()));
  let b = a.get(soh);
  if (!b) a.set(soh, (b = new Map()));
  const k3 = `${today}|${promo ? (promo as { updatedAt?: string }).updatedAt ?? "p" : "-"}`;
  const hit = b.get(k3);
  if (hit) return hit;
  const prices = skuPrices(list, soh.items);
  if (promo) {
    const excl = exclusions(promo.programs);
    for (const m of prices.models)
      if (m.kind === "android" && /samsung/i.test(m.brand))
        for (const v of m.variants) {
          const vp = variantPromo(v.name, promo, today, appConfig().storeCode, excl, v.articles ?? []);
          const etp = etpPromos(v.name, promo.programs, today, appConfig().storeCode);
          if (vp || etp.length) v.samsung = { ...(vp ?? { items: [], cash: { total: 0, kinds: [] }, pwp: 0, info: [] }), etp };
        }
  }
  // the client only needs the prices, not the article lists
  for (const m of prices.models) for (const v of m.variants) delete v.articles;
  if (b.size > 4) b.clear();
  b.set(k3, prices);
  return prices;
}

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
  const intro = "SOH per kategori dari PDF Sales Dashboard V6 / Excel Stock Position Report · Qty Sold dari Sales Person.";

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
        <Panel><EmptyBlock title="Data SOH">Belum ada SOH. Upload PDF Stock On Hand atau Excel Stock Position Report di Data Upload → Import SOH.</EmptyBlock></Panel>
      </div>
    );
  }

  const kosong = await stockKosong(soh, p.snap);
  const kosongCount = kosong.groups.reduce((a, g) => a + g.items.length, 0);

  if (p.q.v === "kosong") {
    const { groups, from, to, partial } = kosong;
    const meta = { store: appConfig().storeCode, from, to, sohDate: soh.date };
    const text: Record<string, string> = { "": fulfillmentText(groups, meta) };
    for (const g of groups) text[g.category] = fulfillmentText([g], meta);
    const range = `${dmy(meta.from)} – ${dmy(to)}`;
    return (
      <div className="sd-content">
        <PageIntro
          title="Stock On Hand"
          desc={`Need fulfillment: device yang terjual ${range} tapi kosong di SOH ${soh.date ? dmy(soh.date) : "terakhir"}. Aksesoris tidak termasuk (AirPods termasuk).`}
          actions={manage}
        />
        <Tabs kosong count={kosongCount} />
        {partial && <div className="alert warn">Data penjualan bulan lalu tidak tersedia — yang dihitung hanya mulai {dmy(monthStart(p.month))}.</div>}
        <StockKosong groups={groups} text={text} range={range} />
      </div>
    );
  }

  // price popup per SKU (with Samsung promos): optional — a failed price-list read must not hide the stock
  const today = todayIn(appConfig().timeZone);
  const prices = await sohPrices(soh, today);

  return (
    <div className="sd-content">
      <PageIntro
        title="Stock On Hand"
        desc={`Update stok ${soh.date ? dmy(soh.date) : "–"} · diimport ${soh.updatedAt ? timeAgo(Date.parse(soh.updatedAt)) : "–"} · Qty Sold dari Sales Person s/d ${dmy(p.asOf)}.`}
        actions={manage}
      />
      <Tabs kosong={false} count={kosongCount} />
      <SohView categories={soh.categories} rows={sohRows(soh.items, p.snap.lines, p.asOf).map(({ price: _p, ...r }) => ({ ...r, coverDays: r.coverDays == null ? null : Math.round(r.coverDays) }))} prices={prices} today={today} initialCat={p.q.cat ?? ""} initialSearch={(p.q.s ?? "").trim()} initialType={p.q.j ?? ""} initialSeries={p.q.sr ?? ""} />
    </div>
  );
}
