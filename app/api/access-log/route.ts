import { NextResponse } from "next/server";
import { NAV, isGroup } from "@/components/shell/nav";
import { recordAccess } from "@/lib/accessLog";
import { getSession } from "@/lib/auth/session";
import { cleanPath, isAppPath } from "@/lib/domain/access";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";

/** Every page in the menu; anything else is not logged. */
const APP_PATHS = NAV.flatMap((e) => (isGroup(e) ? e.items : [e])).map((l) => l.href);

/** A signed-in user opened a page (sent by the app shell on every navigation). */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await getSession();
    if (!s) return NextResponse.json({ error: "Sesi berakhir, silakan login ulang" }, { status: 401 });
    const b = await jsonBody<{ path?: string }>(req);
    const path = cleanPath(b.path);
    if (!path) throw new BadRequest("Path tidak valid");
    if (isAppPath(path, APP_PATHS)) recordAccess(req, "view", s, path);
    return new NextResponse(null, { status: 204 });
  });
}
