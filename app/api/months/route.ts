import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { spreadsheetIdFrom } from "@/lib/repositories/sheets/client";
import { invalidate } from "@/lib/cache";

/** Admin: register / update the spreadsheet link for a month. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ month?: string; url?: string; label?: string; active?: boolean; checkOnly?: boolean }>(req);
    const month = String(b.month ?? "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequest("Format bulan harus YYYY-MM");
    const ds = dataSource();
    const spreadsheetId = ds.kind === "fixture" ? `fixture-${month}` : spreadsheetIdFrom(String(b.url ?? ""));
    if (!spreadsheetId) throw new BadRequest("Link Google Sheet tidak valid");
    const check = await ds.checkSource(spreadsheetId);
    if (b.checkOnly) return NextResponse.json({ ok: true, check });
    if (!check.hasSales) throw new BadRequest(`File "${check.title}" tidak punya tab sales yang diharapkan`);
    await ds.saveMonth({
      month,
      spreadsheetId,
      label: String(b.label ?? check.title).slice(0, 100),
      active: b.active ?? true,
      updatedAt: new Date().toISOString(),
      updatedBy: s.nik,
    });
    await ds.audit({ nik: s.nik, action: "month.save", detail: `${month} → ${spreadsheetId}` }).catch(() => {});
    invalidate("months");
    invalidate(`month:${month}:`);
    return NextResponse.json({ ok: true, check });
  });
}
