import "server-only";
import { cached, shared } from "@/lib/cache";
import { dataSource } from "@/lib/repositories";
import type { AccPriceList } from "@/types/accPrice";

/** Changes only on import (which expires the "accprice" tag). */
const TTL_SEC = 60;

/** Cached read of the stored accessories price list. null = never imported; a failed read THROWS. */
export async function getAccPriceList(): Promise<AccPriceList | null> {
  const { value } = await cached("accprice:latest", TTL_SEC * 1000, () => shared(["accprice", "latest"], ["accprice"], TTL_SEC, () => dataSource().getAccPriceList()));
  return value ?? (await dataSource().getAccPriceList());
}
