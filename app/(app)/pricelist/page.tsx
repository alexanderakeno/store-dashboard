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
import { getPwpPromo } from "@/lib/pwpPromo";
import { pwpPrices, variantPwp, type PwpBrief } from "@/lib/domain/pwpPromo";
import type { SearchParams } from "@/lib/page";
import type { PriceKind, PriceList } from "@/types/pricelist";
import type { SohSnapshot } from "@/types/soh";
import { getAccPriceList } from "@/lib/accPrice";
import { accRows, accSummary, packAcc } from "@/lib/domain/accPrice";
import { AccPriceBoard } from "@/components/modules/AccPriceBoard";
import { AccPriceImport } from "@/components/modules/AccPriceImport";
import { num } from "@/lib/format";

type Tab = PriceKind | "acc" | "history";
const TABS: Array<{ key: Tab; label: string; href: string }> = [
  { key: "android", label: "Android", href: "/pricelist" },
  { key: "apple", label: "Apple", href: "/pricelist?k=apple" },
  { key: "acc", label: "Aksesoris", href: "/pricelist?k=acc" },
  { key: "history", label: "Riwayat Harga", href: "/pricelist?k=history" },
];

export default async function PriceListPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const q = await searchParams;
  if (q.k === "history") return <HistoryTab />;
  if (q.k === "acc") return <AccTab isAdmin={session.role === "admin"} all={q.semua === "1"} />;
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
  // PWP promos (all brands) per price-list row, by its SAP articles — optional as well
  const pwp: Record<string, PwpBrief[]> = {};
  const pwpPromo = await getPwpPromo().catch(() => null);
  if (pwpPromo && list) {
    const acc = await getAccPriceList().catch(() => null);
    const prices = pwpPrices(list.items, acc?.items ?? []);
    for (const m of models)
      for (const v of m.variants) {
        const b = variantPwp(v.articles ?? [], pwpPromo, today, prices);
        if (b.length) pwp[v.id] = b;
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
        <PriceBoard key={kind} models={models} qoala={list?.qoala ?? []} hasSoh={!!soh} promos={promos} pwp={pwp} today={today} initialBrand={typeof q.b === "string" ? q.b : ""} initialModel={typeof q.t === "string" ? q.t : ""} />
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

function Tabs({ current }: { current: Tab }) {
  return (
    <nav className="sd-tabs grid-cols-4" aria-label="Jenis price list">
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

/** "Aksesoris": the accessories price list joined with the accessories in the SOH (by article). */
async function AccTab({ isAdmin, all }: { isAdmin: boolean; all: boolean }) {
  const action = isAdmin ? <AccPriceImport compact /> : undefined;
  let list: Awaited<ReturnType<typeof getAccPriceList>> = null;
  let error: string | null = null;
  try {
    list = await getAccPriceList();
  } catch (e) {
    error = (e as Error).message;
  }
  let soh: SohSnapshot | null = null;
  try {
    soh = await getSoh();
  } catch {}
  const items = list?.items ?? [];
  const rows = items.length || soh ? accRows(items, soh?.items ?? null, all) : [];
  const sum = accSummary(rows, soh?.items ?? null);
  const desc = list ? `Price list aksesoris ${list.date ? dmy(list.date) : ""}${list.updatedAt ? ` · diimport ${timeAgo(Date.parse(list.updatedAt))}` : ""}${soh?.date ? ` · SOH ${dmy(soh.date)}` : ""}` : "Harga aksesoris per artikel, dicocokkan dengan stok di SOH.";

  return (
    <div className="sd-content">
      <PageIntro title="Price List" desc={desc} actions={action} />
      <Tabs current="acc" />
      {error && <div className="alert error" role="alert">Price list aksesoris tidak bisa dibaca: {error}</div>}
      {!items.length && !error && (
        <Panel>
          <EmptyBlock title="Price list aksesoris">
            Belum ada price list aksesoris. {isAdmin ? "Klik Import Price List Aksesoris di atas lalu pilih file Excel-nya." : "Minta admin import file Excel price list aksesoris."}
            {soh ? " Sementara ini harga diambil dari SOH." : ""}
          </EmptyBlock>
        </Panel>
      )}
      {soh && (
        <>
          <p className="text-xs text-slate-500">
            {all ? (
              <>Menampilkan semua artikel price list ({num(items.length)}), termasuk yang tidak ada stok. <Link href="/pricelist?k=acc" prefetch={false} className="font-semibold text-blue-600">Hanya yang ada stok</Link></>
            ) : (
              <>Hanya aksesoris yang ada stoknya di SOH ({num(sum.articles)} artikel · {num(sum.units)} pcs).{items.length ? <> <Link href="/pricelist?k=acc&semua=1" prefetch={false} className="font-semibold text-blue-600">Tampilkan semua price list ({num(items.length)})</Link></> : null}</>
            )}
          </p>
          {items.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Harga dari price list" value={sum.fromList} sub={`dari ${num(sum.articles)} artikel stok`} tone="green" />
              <Stat label="Harga dari SOH" value={sum.fromSoh} sub="tidak ada di price list" tone="amber" />
              <Stat label="Harga berubah" value={sum.changed} sub="ganti label harga" tone="blue" />
              <Stat label="Di bawah SRP" value={sum.promo} sub="promo / repricing" tone="violet" />
            </div>
          )}
        </>
      )}
      {rows.length > 0 && <AccPriceBoard key={all ? "all" : "stock"} rows={rows.map(packAcc)} hasSoh={!!soh} />}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: "green" | "amber" | "blue" | "violet" }) {
  const c = { green: "text-emerald-600", amber: "text-amber-600", blue: "text-blue-600", violet: "text-violet-600" }[tone];
  return (
    <div className="sd-panel p-3 sm:p-4">
      <p className="text-[11px] font-black tracking-[.08em] text-slate-500 uppercase">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${c}`}>{num(value)}</p>
      <p className="text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}
