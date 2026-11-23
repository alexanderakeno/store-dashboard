import "server-only";
import { cached, shared } from "@/lib/cache";
import { dataSource } from "@/lib/repositories";
import type { DraSnapshot } from "@/types/dra";

/** The DRA only changes on import (which expires the "dra" tag). */
const DRA_TTL_SEC = 300;

/** Cached read of the latest DRA import; null = never imported. A failed read throws. */
export async function getDra(): Promise<DraSnapshot | null> {
  const { value } = await cached("dra:latest", DRA_TTL_SEC * 1000, () => shared(["dra", "latest"], ["dra"], DRA_TTL_SEC, () => dataSource().getDra()));
  return value;
}
