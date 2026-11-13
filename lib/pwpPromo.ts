import "server-only";
import { cached, shared } from "@/lib/cache";
import { dataSource } from "@/lib/repositories";
import type { PwpPromo } from "@/types/pwpPromo";

/** Changes only on import (which expires the "pwppromo" tag). */
const TTL_SEC = 60;

/** Cached read of the stored PWP promo. null = never imported; a failed read THROWS. */
export async function getPwpPromo(): Promise<PwpPromo | null> {
  const { value } = await cached("pwppromo:latest", TTL_SEC * 1000, () => shared(["pwppromo", "latest"], ["pwppromo"], TTL_SEC, () => dataSource().getPwpPromo()));
  return value ?? (await dataSource().getPwpPromo());
}
