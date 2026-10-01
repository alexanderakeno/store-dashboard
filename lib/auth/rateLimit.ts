import "server-only";

/**
 * Login attempt limiter (per serverless instance). Failed attempts only.
 * Limits: 5 per IP+NIK and 20 per IP within 15 minutes.
 */
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { pair: 5, ip: 20 };

const g = globalThis as unknown as { __loginFails?: Map<string, number[]> };
const fails: Map<string, number[]> = (g.__loginFails ??= new Map());

function recent(key: string, now: number): number[] {
  const list = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) fails.set(key, list);
  else fails.delete(key);
  return list;
}

export function loginBlocked(ip: string, nik: string, now = Date.now()): { blocked: boolean; retryAfterSec: number } {
  const pair = recent(`p:${ip}:${nik}`, now);
  const all = recent(`i:${ip}`, now);
  const over = pair.length >= LIMITS.pair ? pair : all.length >= LIMITS.ip ? all : null;
  if (!over) return { blocked: false, retryAfterSec: 0 };
  return { blocked: true, retryAfterSec: Math.ceil((over[0] + WINDOW_MS - now) / 1000) };
}

export function recordFailure(ip: string, nik: string, now = Date.now()): void {
  for (const k of [`p:${ip}:${nik}`, `i:${ip}`]) fails.set(k, [...recent(k, now), now]);
}

export function clearFailures(ip: string, nik: string): void {
  fails.delete(`p:${ip}:${nik}`);
}
