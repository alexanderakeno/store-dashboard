import "server-only";
import { cached, shared } from "@/lib/cache";
import { dataSource } from "@/lib/repositories";
import type { SamsungPromo } from "@/types/samsungPromo";

/** Changes only on import (which expires the "samsungpromo" tag). */
const TTL_SEC = 60;

/** Cached read of the stored Samsung promo. null = never imported; a failed read THROWS. */
export async function getSamsungPromo(): Promise<SamsungPromo | null> {
  const { value } = await cached("samsungpromo:latest", TTL_SEC * 1000, () => shared(["samsungpromo", "latest"], ["samsungpromo"], TTL_SEC, () => dataSource().getSamsungPromo()));
  return value ?? (await dataSource().getSamsungPromo());
}
