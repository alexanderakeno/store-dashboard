import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Two cache layers in front of Google Sheets:
 *
 * 1. `shared()` — Vercel Data Cache, shared by every serverless instance and kept
 *    across cold starts. After `revalidateSec` it serves the stale value instantly
 *    and refreshes in the background, so visitors almost never wait for Sheets.
 * 2. `cached()` — tiny per-instance memory layer with in-flight de-duplication,
 *    so one request (or a burst) doesn't hit the Data Cache repeatedly.
 *
 * `invalidate(prefix)` clears the memory keys with that prefix AND expires the
 * shared tag of the same name (trailing ":" dropped; "" = everything), so admin
 * Refresh / Import / Settings saves show fresh data on every instance.
 */
interface Entry<T> {
  value?: T;
  loadedAt: number;
  pending?: Promise<T>;
}

const g = globalThis as unknown as { __appCache?: Map<string, Entry<unknown>> };
const cache: Map<string, Entry<unknown>> = (g.__appCache ??= new Map());

/** Tag carried by every shared entry — expiring it refreshes everything. */
export const ALL_TAG = "sheets";

export interface Cached<T> {
  value: T;
  loadedAt: number;
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, force = false): Promise<Cached<T>> {
  const now = Date.now();
  const hit = cache.get(key) as Entry<T> | undefined;
  if (!force && hit?.value !== undefined && now - hit.loadedAt < ttlMs) return { value: hit.value, loadedAt: hit.loadedAt };
  if (!force && hit?.pending) {
    const value = await hit.pending;
    return { value, loadedAt: (cache.get(key) as Entry<T>).loadedAt };
  }
  const pending = load();
  cache.set(key, { ...hit, loadedAt: hit?.loadedAt ?? 0, pending });
  try {
    const value = await pending;
    const loadedAt = Date.now();
    cache.set(key, { value, loadedAt });
    return { value, loadedAt };
  } catch (e) {
    if (hit?.value !== undefined) cache.set(key, { value: hit.value, loadedAt: hit.loadedAt });
    else cache.delete(key);
    throw e;
  }
}

/**
 * Cross-instance cache (stale-while-revalidate). `force` skips it and reads the
 * source directly — callers expire the tag first so other instances follow.
 * Values must be JSON-serialisable.
 */
export function shared<T>(keyParts: string[], tags: string[], revalidateSec: number, load: () => Promise<T>, force = false): Promise<T> {
  if (force) return load();
  return unstable_cache(load, keyParts, { tags: [ALL_TAG, ...tags], revalidate: Math.max(1, Math.round(revalidateSec)) })();
}

export function invalidate(prefix = ""): void {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  try {
    revalidateTag(prefix.replace(/:$/, "") || ALL_TAG, { expire: 0 });
  } catch {
    // outside a request (scripts/tests): memory layer is all there is
  }
}
