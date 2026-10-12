import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { getMonths, invalidateMonth } from "@/lib/services/dashboard";
import { forwardImportRaw, type RawRows } from "@/lib/importRaw";

export const maxDuration = 60;

const MAX_ROWS = 50_000;

function rows(v: unknown, name: string): RawRows | null {
  if (v == null) return null;
  if (!Array.isArray(v) || v.length > MAX_ROWS || !v.every((r) => Array.isArray(r))) throw new BadRequest(`Data ${name} tidak valid`);
  return v as RawRows;
}

/** Admin: import raw Merchandise Report and/or Sales Person into the month's "Control MR &SP" tab. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    if (dataSource().kind === "fixture") throw new BadRequest("Import tidak tersedia di mode data sintetis");
    const b = await jsonBody<{ month?: string; mr?: unknown; sp?: unknown }>(req);
    const month = String(b.month ?? "");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequest("Format bulan harus YYYY-MM");
    const mr = rows(b.mr, "Merchandise Report");
    const sp = rows(b.sp, "Sales Person");
    if (!mr && !sp) throw new BadRequest("Pilih minimal satu file");

    const entry = (await getMonths()).find((m) => m.month === month) ?? (await getMonths(true)).find((m) => m.month === month);
    if (!entry) throw new BadRequest(`Bulan ${month} belum terdaftar di Settings`);

    const { message } = await forwardImportRaw(entry.spreadsheetId, mr, sp);
    const parts = [mr && `MR ${mr.length} baris`, sp && `SP ${sp.length} baris`].filter(Boolean).join(", ");
    await dataSource().audit({ nik: s.nik, action: "import.raw", detail: `${month}: ${parts}` }).catch(() => {});
    invalidateMonth(month);
    return NextResponse.json({ ok: true, message });
  });
}
