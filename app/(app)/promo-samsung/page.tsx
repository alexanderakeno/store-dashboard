import Link from "next/link";
import { EmptyBlock, PageIntro, Panel } from "@/components/kit";
import { RetryButton } from "@/components/kit/RetryButton";
import { PromoSamsungView, type PromoCard } from "@/components/modules/PromoSamsungView";
import { appConfig } from "@/config/app";
import { requireSession } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/period";
import { forStore, promoState, type PromoState } from "@/lib/domain/samsungPromo";
import { timeAgo } from "@/lib/format";
import { getSamsungPromo } from "@/lib/samsungPromo";
import { getSoh } from "@/lib/soh";
import type { SearchParams } from "@/lib/page";
import type { SamsungPromo } from "@/types/samsungPromo";

export default async function PromoSamsungPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const q = await searchParams;
  const isAdmin = session.role === "admin";
  const update = isAdmin ? <Link href="/upload#promo-samsung" prefetch={false} className="sd-btn primary">Update Promo</Link> : undefined;
  let promo: SamsungPromo | null;
  try {
    promo = await getSamsungPromo();
  } catch (e) {
    return (
      <div className="sd-content">
        <PageIntro title="Promo Samsung" actions={update} />
        <Panel>
          <div className="space-y-3" role="alert">
            <EmptyBlock title="Promo gagal dimuat" need={false}>Google Sheet (tab APP_SamsungPromo) tidak bisa dibaca saat ini: {(e as Error).message}</EmptyBlock>
            <div className="flex justify-center"><RetryButton /></div>
          </div>
        </Panel>
      </div>
    );
  }
  if (!promo) {
    return (
      <div className="sd-content">
        <PageIntro title="Promo Samsung" desc="Promo aktif Samsung per tipe: PWP, Trade In, EIP, cashback." actions={update} />
        <Panel>
          <EmptyBlock title="Promo Samsung">
            Belum ada data promo. {isAdmin ? <>Upload file Excel List Promo Aktif Samsung di <Link href="/upload#promo-samsung" className="font-semibold text-blue-600">Data Upload → Import Promo Samsung</Link>.</> : "Minta admin upload file promo Samsung."}
          </EmptyBlock>
        </Panel>
      </div>
    );
  }

  const cfg = appConfig();
  const store = (cfg.storeCode || "").toUpperCase();
  const today = todayIn(cfg.timeZone);
  let soh: Awaited<ReturnType<typeof getSoh>> = null;
  try {
    soh = await getSoh();
  } catch {}
  const stock = new Map<string, number>();
  for (const s of soh?.items ?? []) stock.set(s.article.toUpperCase(), (stock.get(s.article.toUpperCase()) ?? 0) + s.qty);
  const qty = (a: string) => (soh ? (stock.get(a) ?? 0) : null);

  const sheetCard = (name: string) => {
    const sh = promo.sheets.find((x) => x.name === name)!;
    return {
      name,
      kind: sh.kind,
      notes: sh.notes,
      articles: promo.articles.filter((a) => a.sheet === name).map((a) => ({ article: a.article, description: a.description, value: a.value, code: a.code, normal: a.normal, state: promoState(a.ranges, today), ranges: a.ranges, soh: qty(a.article) })),
      pairs: promo.pairs.filter((p) => p.sheet === name).map((p) => ({ article: p.article, description: p.description, soh: qty(p.article) })),
    };
  };
  const cards: PromoCard[] = promo.programs.map((p) => {
    const sheets = promo.sheets.filter((s) => s.program === p.no).map((s) => sheetCard(s.name));
    // a detail sheet's own period beats the summary's (the detail sheets are the reference)
    const ranges = promo.sheets.find((s) => s.program === p.no && s.ranges.length)?.ranges ?? p.ranges;
    // codes & values as the detail sheets have them (the summary text can be out of date)
    const fromDetail = [...new Map(sheets.flatMap((s) => s.articles).filter((a) => a.code).map((a) => [`${a.code}|${a.value}`, { code: a.code, value: a.value }])).values()];
    const codes = fromDetail.length ? fromDetail : p.codes.map((code) => ({ code, value: 0 }));
    return { key: `p${p.no}`, no: p.no, type: p.type, name: p.name, period: p.period, ranges, state: promoState(ranges, today) as PromoState, mechanism: p.mechanism, combine: p.combine, codes, stores: p.stores, otherStore: !forStore({ stores: p.stores, value: 1 }, store), sheets };
  });
  // detail sheets the summary does not mention
  for (const s of promo.sheets.filter((x) => x.program == null && promo.articles.some((a) => a.sheet === x.name))) {
    cards.push({ key: `s${s.name}`, no: 0, type: s.kind, name: s.name, period: "", ranges: s.ranges, state: promoState(s.ranges, today), mechanism: "", combine: "", codes: [...new Map(promo.articles.filter((a) => a.sheet === s.name && a.code).map((a) => [`${a.code}|${a.value}`, { code: a.code, value: a.value }])).values()], stores: [], otherStore: false, sheets: [sheetCard(s.name)] });
  }

  return (
    <div className="sd-content">
      <PageIntro
        title="Promo Samsung"
        desc={`${promo.title || promo.source}${promo.updatedAt ? ` · diimport ${timeAgo(Date.parse(promo.updatedAt))}` : ""} · kode & nilai dari sheet detail.`}
        actions={update}
      />
      {promo.warnings.length > 0 && (
        <details className="alert warn">
          <summary className="cursor-pointer font-semibold">{promo.warnings.length} kode di sheet List Promo tidak sama dengan sheet detail</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{promo.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}
      <PromoSamsungView cards={cards} store={store} today={today} hasSoh={!!soh} initialFilter={typeof q.f === "string" ? q.f : ""} initialSearch={typeof q.s === "string" ? q.s : ""} />
    </div>
  );
}
