import { NextResponse } from "next/server";
import { recordAccess } from "@/lib/accessLog";
import { getSession } from "@/lib/auth/session";
import { cleanPath } from "@/lib/domain/access";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";

/** A signed-in user opened a page (sent by the app shell on every navigation). */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await getSession();
    if (!s) return NextResponse.json({ error: "Sesi berakhir, silakan login ulang" }, { status: 401 });
    const b = await jsonBody<{ path?: string }>(req);
    const path = cleanPath(b.path);
    if (!path) throw new BadRequest("Path tidak valid");
    recordAccess(req, "view", s, path);
    return new NextResponse(null, { status: 204 });
  });
}
