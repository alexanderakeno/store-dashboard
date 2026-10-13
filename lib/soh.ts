import "server-only";
import { cached, shared } from "@/lib/cache";
import { dataSource } from "@/lib/repositories";
import type { SohSnapshot } from "@/types/soh";

/** SOH changes only on import (which expires the "soh" tag), so a minute of caching is safe. */
const SOH_TTL_SEC = 60;

/**
 * Cached read of the latest SOH import (memory + cross-instance cache).
 * Returns null only when nothing was ever imported; a failed read THROWS —
 * callers must not show a read error as "no data".
 */
export async function getSoh(): Promise<SohSnapshot | null> {
  const { value } = await cached("soh:latest", SOH_TTL_SEC * 1000, () => shared(["soh", "latest"], ["soh"], SOH_TTL_SEC, () => dataSource().getSoh()));
  return value;
}
