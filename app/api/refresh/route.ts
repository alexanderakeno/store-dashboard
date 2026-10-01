import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { getMonthSnapshot, refreshAll, resolveMonth } from "@/lib/services/dashboard";

/** Admin: drop the cache and re-read the spreadsheets now. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const body = await jsonBody<{ month?: string }>(req).catch(() => ({ month: undefined }));
    refreshAll();
    const month = await resolveMonth(body.month);
    if (!month) return NextResponse.json({ ok: true, month: null });
    const snap = await getMonthSnapshot(month, true);
    await dataSource().audit({ nik: s.nik, action: "refresh", detail: month }).catch(() => {});
    return NextResponse.json({
      ok: true,
      month,
      lines: snap.lines.length,
      lastDataDate: snap.lastDataDate,
      errors: snap.issues.filter((i) => i.severity === "error").length,
      loadedAt: snap.loadedAt,
    });
  });
}
