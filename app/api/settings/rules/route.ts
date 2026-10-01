import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { validateRuleOverrides } from "@/lib/domain/rulesValidation";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { invalidate } from "@/lib/cache";

/** Admin: save business-rule overrides (merged over config/business defaults). */
export async function PUT(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ overrides?: unknown }>(req);
    const result = validateRuleOverrides(b.overrides);
    if (!result.ok) throw new BadRequest(result.error);
    await dataSource().saveRuleOverrides(result.value);
    await dataSource().audit({ nik: s.nik, action: "rules.save", detail: Object.keys(result.value).join(",") }).catch(() => {});
    invalidate();
    return NextResponse.json({ ok: true });
  });
}
