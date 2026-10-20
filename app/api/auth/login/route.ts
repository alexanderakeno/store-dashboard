import { NextResponse } from "next/server";
import { recordAccess } from "@/lib/accessLog";
import { authenticate } from "@/lib/auth/session";
import { normalizeNik } from "@/lib/domain/normalize";
import { clearFailures, loginBlocked, recordFailure } from "@/lib/auth/rateLimit";
import { SESSION_COOKIE, cookieOptions, signSession } from "@/lib/auth/token";
import { assertSameOrigin, handle, jsonBody } from "@/lib/http";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const body = await jsonBody<{ nik?: string; password?: string }>(req);
    const nik = String(body.nik ?? "").trim().slice(0, 32);
    const password = String(body.password ?? "").slice(0, 200);
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

    const block = loginBlocked(ip, nik);
    if (block.blocked)
      return NextResponse.json(
        { error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(block.retryAfterSec / 60)} menit.` },
        { status: 429, headers: { "Retry-After": String(block.retryAfterSec) } },
      );

    const session = await authenticate(nik, password);
    if (!session) {
      recordFailure(ip, nik);
      if (nik) recordAccess(req, "login_failed", { nik: normalizeNik(nik) ?? nik });
      return NextResponse.json({ error: "NIK atau password salah" }, { status: 401 });
    }
    clearFailures(ip, nik);
    recordAccess(req, "login", session);
    const res = NextResponse.json({ ok: true, role: session.role });
    res.cookies.set(SESSION_COOKIE, await signSession(session), cookieOptions);
    return res;
  });
}
