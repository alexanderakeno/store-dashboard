import Link from "next/link";
import { EmptyBlock, PageIntro, Panel } from "@/components/kit";
import { RetryButton } from "@/components/kit/RetryButton";
import { PwpPromoForm } from "@/components/modules/PwpPromoForm";
import { PwpPromoView, type PwpCard } from "@/components/modules/PwpPromoView";
import { appConfig } from "@/config/app";
import { requireSession } from "@/lib/auth/session";
import { getAccPriceList } from "@/lib/accPrice";
import { todayIn } from "@/lib/domain/period";
import { pwpPrices, pwpView } from "@/lib/domain/pwpPromo";
import { timeAgo } from "@/lib/format";
import { getPriceList } from "@/lib/pricelist";
import { getPwpPromo } from "@/lib/pwpPromo";
import { getSoh } from "@/lib/soh";
import type { SearchParams } from "@/lib/page";
import type { PwpPromo } from "@/types/pwpPromo";

export default async function PromoPwpPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const q = await searchParams;
  const isAdmin = session.role === "admin";
  let promo: PwpPromo | null;
  try {
    promo = await getPwpPromo();
  } catch (e) {
    return (
      <div className="sd-content">
        <PageIntro title="Promo PWP" />
        <Panel>
          <div className="space-y-3" role="alert">
            <EmptyBlock title="Promo PWP gagal dimuat" need={false}>Google Sheet (tab APP_PwpPromo) tidak bisa dibaca saat ini: {(e as Error).message}</EmptyBlock>
            <div className="flex justify-center"><RetryButton /></div>
          </div>
        </Panel>
      </div>
    );
  }
  if (!promo) {
    return (
      <div className="sd-content">
        <PageIntro title="Promo PWP" desc="Purchase With Purchase semua brand: aksesoris pasangan, cashback, dan harga bayar." />
        <Panel title="Upload file promo PWP">
          {isAdmin ? <PwpPromoForm current={null} /> : <EmptyBlock title="Belum ada data promo PWP">Minta admin upload file Price List Promo PWP Digiplus.</EmptyBlock>}
        </Panel>
      </div>
    );
  }

  const today = todayIn(appConfig().timeZone);
  const [list, acc, soh] = await Promise.all([getPriceList().catch(() => null), getAccPriceList().catch(() => null), getSoh().catch(() => null)]);
  const prices = pwpPrices(list?.items ?? [], acc?.items ?? []);
  const stock = new Map<string, number>();
  for (const s of soh?.items ?? []) stock.set(s.article.toUpperCase(), (stock.get(s.article.toUpperCase()) ?? 0) + s.qty);
  const qty = (articles: string[]) => (soh ? articles.reduce((a, x) => a + (stock.get(x) ?? 0), 0) : null);
  const cards: PwpCard[] = promo.programs.map((p) => {
    const v = pwpView(p, prices, today);
    return { ...v, soh: { models: v.models.map((m) => qty(m.articles)), items: v.offers.map((o) => o.items.map((it) => qty(it.articles))) } };
  });
  const brand = typeof q.b === "string" ? q.b : "";

  return (
    <div className="sd-content">
      <PageIntro
        title="Promo PWP"
        desc={`${promo.title || promo.source}${promo.updatedAt ? ` · diimport ${timeAgo(Date.parse(promo.updatedAt))}` : ""} · harga mengikuti Price List terbaru.`}
        actions={isAdmin ? <Link href="/upload#promo-pwp" prefetch={false} className="sd-btn">Data Upload</Link> : undefined}
      />
      {isAdmin && promo.warnings.length > 0 && (
        <details className="alert warn">
          <summary className="cursor-pointer font-semibold">{promo.warnings.length} catatan dari file PWP</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{promo.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}
      <PwpPromoView cards={cards} isAdmin={isAdmin} current={promo.source || promo.title} initialSearch={typeof q.s === "string" ? q.s : ""} initialBrand={brand} />
    </div>
  );
}
