import "server-only";

/**
 * Per-instance TTL cache with in-flight de-duplication.
 * On Vercel each serverless instance has its own copy; TTL keeps them close,
 * and admin "Refresh" clears the instance that served the request.
 */
interface Entry<T> {
  value?: T;
  loadedAt: number;
  pending?: Promise<T>;
}

const g = globalThis as unknown as { __appCache?: Map<string, Entry<unknown>> };
const cache: Map<string, Entry<unknown>> = (g.__appCache ??= new Map());

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

export function invalidate(prefix = ""): void {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
}
