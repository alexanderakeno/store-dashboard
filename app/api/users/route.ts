import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { appConfig } from "@/config/app";
import { requireAdmin } from "@/lib/auth/session";
import { normalizeNik } from "@/lib/domain/normalize";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";

/** Admin: create/update a read-only viewer account. Only bcrypt hashes are stored. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ nik?: string; name?: string; password?: string; active?: boolean }>(req);
    const nik = normalizeNik(b.nik);
    const name = String(b.name ?? "").trim().slice(0, 80);
    if (!nik) throw new BadRequest("NIK tidak valid");
    if (nik === normalizeNik(appConfig().adminNik)) throw new BadRequest("NIK admin diatur lewat env, bukan di sini");
    const ds = dataSource();
    const existing = (await ds.listUsers()).find((u) => u.nik === nik);
    const password = String(b.password ?? "");
    if (!existing && password.length < 8) throw new BadRequest("Password minimal 8 karakter");
    if (password && password.length < 8) throw new BadRequest("Password minimal 8 karakter");
    if (!name && !existing) throw new BadRequest("Nama wajib diisi");
    await ds.saveUser({
      nik,
      name: name || existing!.name,
      role: "viewer",
      passwordHash: password ? await bcrypt.hash(password, 12) : existing!.passwordHash,
      active: b.active ?? true,
    });
    await ds.audit({ nik: s.nik, action: existing ? "user.update" : "user.create", detail: nik }).catch(() => {});
    return NextResponse.json({ ok: true });
  });
}
