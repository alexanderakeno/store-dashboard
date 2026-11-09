import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { closeSession, previewStart, staffCandidates, startRecount, startSession } from "@/lib/stokan";
import type { StokanMode } from "@/types/stokan";

/** Admin actions: preview · start · recount · close · cancel. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ action?: unknown; mode?: unknown; staff?: unknown; id?: unknown }>(req);
    const action = String(b.action ?? "");
    const mode: StokanMode = b.mode === "full" ? "full" : "rolling";
    const id = String(b.id ?? "");
    try {
      if (action === "preview") return NextResponse.json(await previewStart(mode));
      if (action === "start") {
        const pool = await staffCandidates();
        const want = new Set(Array.isArray(b.staff) ? (b.staff as unknown[]).map(String) : []);
        const staff = pool.filter((p) => want.has(p.nik));
        const x = await startSession(mode, staff, s.nik);
        await dataSource().audit({ nik: s.nik, action: "stokan.start", detail: `${x.label} · ${staff.length} staff` }).catch(() => {});
        return NextResponse.json({ ok: true, id: x.id });
      }
      if (action === "recount") {
        const n = await startRecount(id);
        await dataSource().audit({ nik: s.nik, action: "stokan.recount", detail: `${id} · ${n} artikel` }).catch(() => {});
        return NextResponse.json({ ok: true, recount: n });
      }
      if (action === "close" || action === "cancel") {
        const x = await closeSession(id, action === "cancel");
        await dataSource().audit({ nik: s.nik, action: `stokan.${action}`, detail: x.label }).catch(() => {});
        return NextResponse.json({ ok: true });
      }
    } catch (e) {
      if (e instanceof BadRequest) throw e;
      throw new BadRequest((e as Error).message);
    }
    throw new BadRequest("Aksi tidak dikenal");
  });
}
