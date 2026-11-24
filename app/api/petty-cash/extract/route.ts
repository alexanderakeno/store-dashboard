import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { extractReceipt } from "@/lib/pettyCash";

export const maxDuration = 60;

/** Admin: one compressed receipt page (JPEG, base64) → date, description, account, amount. Nothing is stored. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    await requireAdmin();
    const b = await jsonBody<{ image?: unknown }>(req);
    const img = typeof b.image === "string" ? b.image.replace(/^data:image\/jpeg;base64,/, "") : "";
    if (!img || img.length > 4_000_000 || !/^[A-Za-z0-9+/=]+$/.test(img)) throw new BadRequest("Gambar tidak valid");
    const r = await extractReceipt(img);
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  });
}
