/** Quota (429) and transient server errors are retried with exponential backoff + jitter. */
export const RETRIES = 4;
const BASE_DELAY_MS = 400;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 429 = request was rejected, never applied → always safe to retry.
 * 5xx / network errors may have been applied → retry only idempotent calls
 * (reads, PUT overwrite, :clear), never append / batchUpdate.
 */
export function retryable(url: string, method: string, status: number | null): boolean {
  if (status === 429) return true;
  if (status !== null && ![500, 502, 503, 504].includes(status)) return false;
  return method === "GET" || method === "PUT" || url.includes(":clear");
}

export function backoff(attempt: number, retryAfter: string | null): number {
  const sec = Number(retryAfter);
  if (retryAfter && Number.isFinite(sec) && sec > 0) return Math.min(sec * 1000, 10_000);
  return BASE_DELAY_MS * 2 ** attempt + Math.random() * BASE_DELAY_MS;
}
