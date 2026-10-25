import Link from "next/link";
import { EmptyBlock, PageIntro, Panel } from "@/components/kit";
import { RetryButton } from "@/components/kit/RetryButton";
import { PriceBoard } from "@/components/modules/PriceBoard";
import { requireSession } from "@/lib/auth/session";
import { priceModels } from "@/lib/domain/pricelist";
import { dmy, timeAgo } from "@/lib/format";
import { getPriceHistory, getPriceList } from "@/lib/pricelist";
import { PriceHistory } from "@/components/modules/PriceHistory";
import { groupUpdates } from "@/lib/domain/priceHistory";
import { appConfig } from "@/config/app";
import { PRICE_LIST_ALWAYS_SHOW } from "@/config/business";
import { getSoh } from "@/lib/soh";
import { getSamsungPromo } from "@/lib/samsungPromo";
import { etpPromos, exclusions, variantPromo, type VariantPromo } from "@/lib/domain/samsungPromo";
import { todayIn } from "@/lib/domain/period";
import type { SearchParams } from "@/lib/page";
import type { PriceKind, PriceList } from "@/types/pricelist";
import type { SohSnapshot } from "@/types/soh";

const TABS: Array<{ key: PriceKind | "history"; label: string; href: string }> = [
  { key: "android", label: "Android", href: "/pricelist" },
  { key: "apple", label: "Apple", href: "/pricelist?k=apple" },
  { key: "history", label: "Riwayat Harga", href: "/pricelist?k=history" },
];

export default async function PriceListPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const q = await searchParams;
  if (q.k === "history") return <HistoryTab />;
  const kind: PriceKind = q.k === "apple" ? "apple" : "android";
  const isAdmin = session.role === "admin";
  const update = isAdmin ? <Link href={`/upload#pricelist-${kind}`} prefetch={false} className="sd-btn primary">Update Price List {kind === "apple" ? "Apple" : "Android"}</Link> : undefined;

  let list: PriceList | null;
  try {
    list = await getPriceList();
  } catch (e) {
    return (
      <div className="sd-content">
        <PageIntro title="Price List" actions={update} />
        <Panel>
          <div className="space-y-3" role="alert">
            <EmptyBlock title="Price list gagal dimuat" need={false}>Google Sheet (tab APP_PriceList) tidak bisa dibaca saat ini: {(e as Error).message}</EmptyBlock>
            <div className="flex justify-center"><RetryButton /></div>
          </div>
        </Panel>
      </div>
    );
  }
  // stock is a nice-to-have here: a failed SOH read must not hide the prices
  let soh: SohSnapshot | null = null;
  try {
    soh = await getSoh();
  } catch {}

  // only types in stock, unless "Tampilkan semua" is on; needs a readable SOH.
  // Apple: always (PDF or Excel import); Android: Excel rows (with articles) — Android PDF rows have no reliable match
  const all = q.semua === "1";
  const byArticle = kind === "apple" ? !!list?.items.some((x) => x.kind === "apple") : !!list?.items.some((x) => x.kind === kind && x.articles?.length);
  const models = list ? priceModels(list.items, kind, soh?.items ?? [], { inStockOnly: !!soh && byArticle && !all, alwaysShow: PRICE_LIST_ALWAYS_SHOW }) : [];
  const hidden = byArticle && soh && !all ? (list ? priceModels(list.items, kind, soh.items).reduce((a, m) => a + m.variants.length, 0) : 0) - models.reduce((a, m) => a + m.variants.length, 0) : 0;
  // Samsung promos (PWP / trade in / EIP) per price-list row — optional, never blocks the prices
  const promos: Record<string, VariantPromo> = {};
  const today = todayIn(appConfig().timeZone);
  if (kind === "android") {
    const promo = await getSamsungPromo().catch(() => null);
    if (promo) {
      const excl = exclusions(promo.programs);
      for (const m of models)
        if (/samsung/i.test(m.brand))
          for (const v of m.variants) {
            const vp = variantPromo(v.name, promo, today, appConfig().storeCode, excl, v.articles ?? []);
            const etp = etpPromos(v.name, promo.programs, today, appConfig().storeCode);
            if (vp || etp.length) promos[v.id] = { ...(vp ?? { items: [], cash: { total: 0, kinds: [] }, pwp: 0, info: [] }), etp };
          }
    }
  }
  const date = list?.dates[kind];
  const updated = list?.updatedAt[kind];
  const label = kind === "apple" ? "Apple" : "Android";

  return (
    <div className="sd-content">
      <PageIntro
        title="Price List"
        desc={date || updated ? `Price list ${label} ${date ? dmy(date) : ""}${updated ? ` · diimport ${timeAgo(Date.parse(updated))}` : ""}${soh?.date ? ` · SOH ${dmy(soh.date)}` : ""}` : `Harga normal, promo, dan stok per tipe.`}
        actions={update}
      />
      <Tabs current={kind} />
      {byArticle && (
        <p className="text-xs text-slate-500">
          {!soh ? (
            "Data SOH belum terbaca — semua tipe ditampilkan."
          ) : all ? (
            <>Menampilkan semua tipe, termasuk yang stoknya kosong. <Link href={kind === "apple" ? "/pricelist?k=apple" : "/pricelist"} prefetch={false} className="font-semibold text-blue-600">Hanya yang ada stok</Link></>
          ) : (
            <>Hanya tipe yang ada stoknya di SOH{hidden > 0 ? ` (${hidden} tipe stok kosong disembunyikan)` : ""}. <Link href={kind === "apple" ? "/pricelist?k=apple&semua=1" : "/pricelist?semua=1"} prefetch={false} className="font-semibold text-blue-600">Tampilkan semua</Link></>
          )}
        </p>
      )}
      {models.length ? (
        <PriceBoard key={kind} models={models} qoala={list?.qoala ?? []} hasSoh={!!soh} promos={promos} today={today} initialBrand={typeof q.b === "string" ? q.b : ""} initialModel={typeof q.t === "string" ? q.t : ""} />
      ) : (
        <Panel>
          <EmptyBlock title={`Price list ${label}`}>
            Belum ada price list {label}. {isAdmin ? <>Upload PDF-nya di <Link href={`/upload#pricelist-${kind}`} className="font-semibold text-blue-600">Data Upload → Import Price List {label}</Link>.</> : `Minta admin upload PDF price list ${label}.`}
          </EmptyBlock>
        </Panel>
      )}
    </div>
  );
}

function Tabs({ current }: { current: PriceKind | "history" }) {
  return (
    <nav className="sd-tabs grid-cols-3" aria-label="Jenis price list">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} prefetch={false} className="sd-tab" aria-current={current === t.key ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** "Riwayat Harga": what changed at every price list import (Android & Apple). */
async function HistoryTab() {
  let error: string | null = null;
  const lines = await getPriceHistory().catch((e: Error) => {
    error = e.message;
    return [];
  });
  return (
    <div className="sd-content">
      <PageIntro title="Price List" desc="Riwayat harga: apa saja yang berubah di setiap update price list." />
      <Tabs current="history" />
      {error && <div className="alert error">Riwayat harga tidak bisa dibaca: {error}</div>}
      <PriceHistory updates={groupUpdates(lines).slice(0, 40)} timeZone={appConfig().timeZone} />
    </div>
  );
}
