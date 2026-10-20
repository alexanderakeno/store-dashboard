import Link from "next/link";
import { EmptyBlock, PageIntro, Panel } from "@/components/kit";
import { RetryButton } from "@/components/kit/RetryButton";
import { PriceBoard } from "@/components/modules/PriceBoard";
import { requireSession } from "@/lib/auth/session";
import { priceModels } from "@/lib/domain/pricelist";
import { dmy, timeAgo } from "@/lib/format";
import { getPriceList } from "@/lib/pricelist";
import { getSoh } from "@/lib/soh";
import type { SearchParams } from "@/lib/page";
import type { PriceKind, PriceList } from "@/types/pricelist";
import type { SohSnapshot } from "@/types/soh";

const TABS: Array<{ key: PriceKind; label: string }> = [
  { key: "android", label: "Android" },
  { key: "apple", label: "Apple" },
];

export default async function PriceListPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const q = await searchParams;
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

  const models = list ? priceModels(list.items, kind, soh?.items ?? []) : [];
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
      <nav className="sd-tabs grid-cols-2" aria-label="Jenis price list">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "android" ? "/pricelist" : "/pricelist?k=apple"} prefetch={false} className="sd-tab" aria-current={kind === t.key ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {models.length ? (
        <PriceBoard key={kind} models={models} qoala={list?.qoala ?? []} hasSoh={!!soh} initialBrand={typeof q.b === "string" ? q.b : ""} initialModel={typeof q.t === "string" ? q.t : ""} />
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
