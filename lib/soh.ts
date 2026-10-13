import "server-only";
import { appConfig } from "@/config/app";
import { cached, shared } from "@/lib/cache";
import { dataSource } from "@/lib/repositories";
import type { SohSnapshot } from "@/types/soh";

/** Cached read of the latest SOH import (imports expire the "soh" tag). Null on error or when never imported. */
export async function getSoh(): Promise<SohSnapshot | null> {
  try {
    const { value } = await cached("soh:latest", appConfig().cacheTtlMs, () =>
      shared(["soh", "latest"], ["soh"], appConfig().cacheTtlMs / 1000, () => dataSource().getSoh()),
    );
    return value;
  } catch {
    return null;
  }
}
