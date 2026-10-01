import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { invalidateMonth } from "@/lib/services/dashboard";

/** Admin: replace the traffic entries of one month. */
export async function PUT(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ month?: string; entries?: Array<{ date?: string; traffic?: number }> }>(req);
    const month = String(b.month ?? "");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequest("Format bulan harus YYYY-MM");
    if (!Array.isArray(b.entries) || b.entries.length > 31) throw new BadRequest("Data traffic tidak valid");
    const entries = b.entries.map((e) => {
      const date = String(e.date ?? "");
      const traffic = Number(e.traffic ?? 0);
      if (!date.startsWith(month) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest(`Tanggal ${date} di luar bulan ${month}`);
      if (!Number.isInteger(traffic) || traffic < 0 || traffic > 100000) throw new BadRequest(`Traffic ${date} harus bilangan bulat ≥ 0`);
      return { date, traffic };
    });
    await dataSource().saveTraffic(month, entries, s.nik);
    await dataSource().audit({ nik: s.nik, action: "traffic.save", detail: `${month}: ${entries.filter((e) => e.traffic).length} hari` }).catch(() => {});
    invalidateMonth(month, "traffic");
    return NextResponse.json({ ok: true });
  });
}
