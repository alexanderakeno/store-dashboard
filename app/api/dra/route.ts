import { NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/auth/session";
import { invalidate } from "@/lib/cache";
import { getDra } from "@/lib/dra";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { DRA_LIMITS, type DraPack } from "@/types/dra";

const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Latest DRA for the DRA page (any signed-in user). */
export async function GET() {
  return handle(async () => {
    await requireSession();
    const d = await getDra();
    return NextResponse.json(d, { headers: { "Cache-Control": "private, max-age=60" } });
  });
}

/** Admin: replace the stored DRA with the pack parsed in the browser from the weekly Excel. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<Partial<DraPack>>(req);
    if (!Array.isArray(b.sites) || !Array.isArray(b.arts) || !Array.isArray(b.rows)) throw new BadRequest("Data DRA tidak valid");
    if (b.sites.length > DRA_LIMITS.sites || b.arts.length > DRA_LIMITS.arts || b.rows.length > DRA_LIMITS.lines * 4 || b.rows.length % 4) throw new BadRequest("Data DRA terlalu besar atau rusak");
    const sites = b.sites.map((x) => str(x, 80));
    const arts = b.arts.map((a) => {
      const x = Array.isArray(a) ? a : [];
      return [str(x[0], 40).toUpperCase(), str(x[1], 160), str(x[2], 80), str(x[3], 40).toUpperCase(), x[4] === 1 ? 1 : 0] as DraPack["arts"][number];
    });
    const rows = b.rows.map((v, i) => {
      const n = Number(v);
      if (!Number.isInteger(n)) throw new BadRequest("Data DRA rusak");
      const col = i % 4;
      if (col === 0 && (n < -1 || n >= sites.length)) throw new BadRequest("Data DRA rusak (toko)");
      if (col === 1 && (n < 0 || n >= arts.length)) throw new BadRequest("Data DRA rusak (artikel)");
      return n;
    });
    if (!rows.length) throw new BadRequest("Data DRA kosong");
    const asOf = b.asOf && /^\d{4}-\d{2}-\d{2}$/.test(String(b.asOf)) ? String(b.asOf) : null;
    const pack: DraPack = { week: str(b.week, 20), asOf, source: str(b.source, 200), sites, arts, rows };
    await dataSource().saveDra(pack, s.nik);
    await dataSource().audit({ nik: s.nik, action: "import.dra", detail: `${pack.week || "-"} ${asOf ?? ""}: ${sites.length} toko, ${arts.length} artikel, ${rows.length / 4} baris` }).catch(() => {});
    invalidate("dra:");
    return NextResponse.json({ ok: true, message: `${pack.week || "DRA"} · ${sites.length} toko · ${arts.length} artikel` });
  });
}
