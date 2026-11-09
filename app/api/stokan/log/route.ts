import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { appendEvents, sessionById } from "@/lib/stokan";
import type { StokanEvent } from "@/types/stokan";

const KINDS = ["add", "set", "done", "extra"] as const;
const str = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Counting phone → appends its queued actions (idempotent per event id). */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await getSession();
    if (!me) return NextResponse.json({ error: "Sesi berakhir, silakan login ulang" }, { status: 401 });
    const b = await jsonBody<{ session?: unknown; events?: unknown }>(req);
    const s = await sessionById(str(b.session, 40));
    if (!s) throw new BadRequest("Stokan tidak ditemukan");
    if (s.status !== "count" && s.status !== "recount") throw new BadRequest("Stokan sudah ditutup — hitungan tidak disimpan");
    if (!Array.isArray(b.events) || !b.events.length || b.events.length > 500) throw new BadRequest("Data hitungan tidak valid");
    const events: StokanEvent[] = (b.events as Array<Record<string, unknown>>).map((e) => {
      const kind = str(e?.kind, 8) as StokanEvent["kind"];
      const value = Number(e?.value);
      const ts = str(e?.ts, 30);
      if (!KINDS.includes(kind) || !Number.isFinite(value) || Math.abs(value) > 100000 || !/^\d{4}-\d\d-\d\dT/.test(ts)) throw new BadRequest("Data hitungan tidak valid");
      const code = str(e?.code, 40);
      return { id: str(e?.id, 40), ts, nik: me.nik, name: me.name, article: str(e?.article, 40).toUpperCase(), ...(code ? { code } : {}), kind, value: Math.round(value), phase: str(e?.phase, 8) === "recount" ? "recount" : "count" };
    });
    if (events.some((e) => !e.id || (e.kind !== "done" && e.kind !== "extra" && !e.article))) throw new BadRequest("Data hitungan tidak valid");
    await appendEvents(s.id, events);
    return NextResponse.json({ ok: true, saved: events.length });
  });
}
