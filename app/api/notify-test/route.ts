import { NextResponse } from "next/server";
import { appConfig } from "@/config/app";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, handle } from "@/lib/http";
import { sendNotification } from "@/lib/notify";

/** Admin: sends a test message to the configured Telegram chat(s). */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const r = await sendNotification(`✅ <b>Tes notifikasi ${appConfig().storeCode || "dashboard"}</b>\nNotifikasi login sudah tersambung. Dikirim oleh ${s.name}.`);
    return NextResponse.json({ ok: true, message: `Pesan tes terkirim ke ${r.sent.join(" & ")}.` });
  });
}
