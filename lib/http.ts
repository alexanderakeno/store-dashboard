import "server-only";
import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";

/** Uniform JSON errors for route handlers; never leaks stack traces. */
export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((e: unknown) => {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof BadRequest) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    const msg = e instanceof Error ? e.message : "Terjadi kesalahan";
    return NextResponse.json({ error: msg }, { status: 500 });
  });
}

export class BadRequest extends Error {}

/** Largest JSON accepted after un-gzipping an upload (the gzipped body itself is capped by Vercel at ~4.5 MB). */
const MAX_JSON_BYTES = 40_000_000;

/**
 * Parses a JSON request body. Uploads may arrive gzipped (`X-Body-Encoding: gzip`, sent by
 * `postJson` in the browser) — 5–10× smaller, so imports from a phone finish faster.
 */
export async function jsonBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  if (req.headers.get("x-body-encoding") === "gzip") {
    let text: string;
    try {
      text = gunzipSync(Buffer.from(await req.arrayBuffer()), { maxOutputLength: MAX_JSON_BYTES }).toString("utf8");
    } catch {
      throw new BadRequest("Upload rusak atau terlalu besar — coba lagi");
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BadRequest("Body harus JSON");
    }
  }
  try {
    return (await req.json()) as T;
  } catch {
    throw new BadRequest("Body harus JSON");
  }
}

/** Blocks cross-site form posts on write endpoints (cookie is SameSite=Lax, this is defence in depth). */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && new URL(origin).host !== host) throw new BadRequest("Origin tidak valid");
}
