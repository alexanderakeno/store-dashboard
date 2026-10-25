import { priceModels } from "./pricelist";
import type { VariantPromo } from "./samsungPromo";
import type { PriceKind, PriceList } from "@/types/pricelist";
import type { SohItem } from "@/types/soh";

/** One price-list model, reduced to what the SOH price popup shows. */
export interface SkuModel {
  kind: PriceKind;
  brand: string;
  model: string;
  /** Price List page key (`?t=`). */
  key: string;
  variants: Array<{ label: string; name: string; normal: number; promo: number; credit?: number; status: string; note?: string; articles?: string[]; samsung?: VariantPromo }>;
}

export interface SkuPrices {
  models: SkuModel[];
  /** SOH article (upper case) → [model index, variant index]. */
  byArticle: Record<string, [number, number]>;
}

/**
 * Price-list row of every SOH article, for the price popup on the SOH page. Uses the same matching as the
 * Price List page (Excel rows by article code, Apple PDF by name tokens, Android PDF by name prefix), so a SKU
 * opens the same model — with all its storages — that the Price List shows. Only models that match an SOH
 * article are returned.
 */
export function skuPrices(list: PriceList | null, soh: SohItem[]): SkuPrices {
  const out: SkuPrices = { models: [], byArticle: {} };
  if (!list?.items.length || !soh.length) return out;
  for (const kind of ["apple", "android"] as const) {
    if (!list.items.some((x) => x.kind === kind)) continue;
    for (const m of priceModels(list.items, kind, soh)) {
      let at = -1;
      m.variants.forEach((v, vi) => {
        for (const s of v.stock) {
          const a = s.article.toUpperCase();
          if (out.byArticle[a]) continue; // first match wins (Apple before Android)
          if (at < 0) {
            at = out.models.length;
            out.models.push({
              kind,
              brand: m.brand,
              model: m.model,
              key: m.key,
              variants: m.variants.map((x) => ({
                label: x.variant,
                name: x.name,
                normal: x.normal,
                promo: x.promo,
                ...(x.credit != null ? { credit: x.credit } : {}),
                status: x.status,
                ...(x.note ? { note: x.note } : {}),
                ...(x.articles?.length ? { articles: x.articles } : {}),
              })),
            });
          }
          out.byArticle[a] = [at, vi];
        }
      });
    }
  }
  return out;
}
