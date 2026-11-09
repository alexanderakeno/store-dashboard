import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { closeSession, previewStart, reassignBrand, staffCandidates, startRecount, startSession } from "@/lib/stokan";
import type { StokanMode } from "@/types/stokan";

/** Admin actions: preview · start · recount · close · cancel. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ action?: unknown; mode?: unknown; staff?: unknown; id?: unknown; assign?: unknown; brand?: unknown; nik?: unknown }>(req);
    const action = String(b.action ?? "");
    const mode: StokanMode = b.mode === "full" ? "full" : "rolling";
    const id = String(b.id ?? "");
    try {
      if (action === "preview") return NextResponse.json(await previewStart(mode));
      if (action === "start") {
        const pool = await staffCandidates();
        const want = new Set(Array.isArray(b.staff) ? (b.staff as unknown[]).map(String) : []);
        const staff = pool.filter((p) => want.has(p.nik));
        // manual split: { brand: nik | "" }
        const assign = b.assign && typeof b.assign === "object" ? Object.fromEntries(Object.entries(b.assign as Record<string, unknown>).slice(0, 500).map(([k, v]) => [String(k).slice(0, 60), String(v ?? "").slice(0, 30)])) : undefined;
        const x = await startSession(mode, staff, s.nik, assign);
        await dataSource().audit({ nik: s.nik, action: "stokan.start", detail: `${x.label} · ${staff.length} staff` }).catch(() => {});
        return NextResponse.json({ ok: true, id: x.id });
      }
      if (action === "reassign") {
        const n = await reassignBrand(id, String(b.brand ?? "").slice(0, 60), String(b.nik ?? "").slice(0, 30));
        await dataSource().audit({ nik: s.nik, action: "stokan.reassign", detail: `${String(b.brand)} → ${String(b.nik)} · ${n} artikel` }).catch(() => {});
        return NextResponse.json({ ok: true, moved: n });
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
