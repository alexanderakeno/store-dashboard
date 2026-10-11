import { NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { RECORD_KINDS, type RecordKind } from "@/lib/repositories/types";
import { invalidate } from "@/lib/cache";

const isKind = (k: unknown): k is RecordKind => RECORD_KINDS.includes(k as RecordKind);

/** Read app records of one kind for a month / date prefix. */
export async function GET(req: Request) {
  return handle(async () => {
    if (!(await getSession())) return NextResponse.json({ error: "Sesi berakhir" }, { status: 401 });
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const prefix = url.searchParams.get("prefix") ?? "";
    if (!isKind(kind)) throw new BadRequest("kind tidak valid");
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(prefix)) throw new BadRequest("prefix harus YYYY-MM atau YYYY-MM-DD");
    return NextResponse.json({ records: await dataSource().listRecords(kind, prefix) });
  });
}

/** Admin: replace all records of `kind` on `date`. */
export async function PUT(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ kind?: string; date?: string; rows?: Array<{ key?: string; data?: Record<string, unknown> }> }>(req);
    if (!isKind(b.kind)) throw new BadRequest("kind tidak valid");
    const date = String(b.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest("Tanggal harus YYYY-MM-DD");
    if (!Array.isArray(b.rows) || b.rows.length > 200) throw new BadRequest("Data tidak valid");
    const rows = b.rows.map((r) => {
      const key = String(r.key ?? "").trim().slice(0, 120);
      if (!key) throw new BadRequest("Key kosong");
      const data: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(r.data ?? {})) {
        if (typeof v === "number" && Number.isFinite(v)) data[k.slice(0, 40)] = v;
        else if (typeof v === "boolean") data[k.slice(0, 40)] = v;
        else if (typeof v === "string") data[k.slice(0, 40)] = v.slice(0, 2000);
      }
      return { key, data };
    });
    await dataSource().saveRecords(b.kind, date, rows, s.nik);
    await dataSource().audit({ nik: s.nik, action: `records.${b.kind}`, detail: `${date}: ${rows.length} baris` }).catch(() => {});
    invalidate(`records:`);
    return NextResponse.json({ ok: true });
  });
}
