import "server-only";
import { appConfig } from "@/config/app";
import { cached, shared } from "@/lib/cache";
import { dataSource } from "@/lib/repositories";
import type { AppRecord, RecordKind } from "@/lib/repositories/types";

/** Cached read of app records (memory + shared cache; writes expire the "records" tag). */
export async function records(kind: RecordKind, prefix: string): Promise<AppRecord[]> {
  try {
    const ttl = Math.min(appConfig().cacheTtlMs, 60_000);
    const { value } = await cached(`records:${kind}:${prefix}`, ttl, () =>
      shared(["records", kind, prefix], ["records", `records:${kind}`], appConfig().cacheTtlMs / 1000, () => dataSource().listRecords(kind, prefix)),
    );
    return value;
  } catch {
    return [];
  }
}
