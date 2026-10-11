import "server-only";
import { appConfig } from "@/config/app";
import { cached } from "@/lib/cache";
import { dataSource } from "@/lib/repositories";
import type { AppRecord, RecordKind } from "@/lib/repositories/types";

/** Cached read of app records (short TTL; writes invalidate). */
export async function records(kind: RecordKind, prefix: string): Promise<AppRecord[]> {
  try {
    const { value } = await cached(`records:${kind}:${prefix}`, Math.min(appConfig().cacheTtlMs, 60_000), () => dataSource().listRecords(kind, prefix));
    return value;
  } catch {
    return [];
  }
}
