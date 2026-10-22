import "server-only";
import { cached, shared } from "@/lib/cache";
import { dataSource } from "@/lib/repositories";
import type { PriceList } from "@/types/pricelist";

/** Price list changes only on import (which expires the "pricelist" tag), so a minute of caching is safe. */
const TTL_SEC = 60;

/** Cached read of the stored price list. null = never imported; a failed read THROWS. */
export async function getPriceList(): Promise<PriceList | null> {
  const { value } = await cached("pricelist:latest", TTL_SEC * 1000, () => shared(["pricelist", "latest"], ["pricelist"], TTL_SEC, () => dataSource().getPriceList()));
  // an empty answer may be a cache from before the first import (another server instance) — re-read it
  return value ?? (await dataSource().getPriceList());
}

/** Newest price history lines (cached a minute; an import expires the "pricehistory" tag). */
export async function getPriceHistory(limit = 4000) {
  const { value } = await cached("pricehistory:latest", TTL_SEC * 1000, () => shared(["pricehistory", String(limit)], ["pricehistory"], TTL_SEC, () => dataSource().listPriceChanges(limit)));
  return value;
}
