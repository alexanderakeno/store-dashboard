import { NextResponse } from "next/server";
import { recordAccess } from "@/lib/accessLog";
import { getSession } from "@/lib/auth/session";
import { SESSION_COOKIE, cookieOptions } from "@/lib/auth/token";

export async function POST(req: Request) {
  const s = await getSession().catch(() => null);
  if (s) recordAccess(req, "logout", s);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
