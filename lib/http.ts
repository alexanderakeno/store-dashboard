import "server-only";
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

export async function jsonBody<T = Record<string, unknown>>(req: Request): Promise<T> {
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
