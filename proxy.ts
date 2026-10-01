import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/** Optimistic auth gate: every route except /login and the login API needs a valid session. */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL("/home", req.url)) : NextResponse.next();
  }
  if (!session) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sesi berakhir, silakan login ulang" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/" && pathname !== "/home") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth/login|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
