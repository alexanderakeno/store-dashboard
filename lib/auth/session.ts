import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appConfig } from "@/config/app";
import { normalizeNik } from "@/lib/domain/normalize";
import { dataSource } from "@/lib/repositories";
import { SESSION_COOKIE, verifySession, type Session } from "./token";

export type { Session };

// Compared against when the NIK is unknown, so response time doesn't reveal valid NIKs.
const DUMMY_HASH = "$2b$12$pZkCcGtRph3HBTfyUNsGaOJQ26aIOxpBlsPotgeAhri/Mp0MC5MrC";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

/** For server components/pages. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireAdminPage(): Promise<Session> {
  const s = await requireSession();
  if (s.role !== "admin") redirect("/home");
  return s;
}

export class AuthError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? "Sesi berakhir, silakan login ulang" : "Hanya admin yang dapat melakukan ini");
  }
}

/** For route handlers that write anything. */
export async function requireAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AuthError(401);
  if (s.role !== "admin") throw new AuthError(403);
  return s;
}

export async function authenticate(nikInput: string, password: string): Promise<Session | null> {
  const cfg = appConfig();
  const nik = normalizeNik(nikInput) ?? nikInput.trim();
  if (!nik || !password) return null;

  if (cfg.adminNik && nik === (normalizeNik(cfg.adminNik) ?? cfg.adminNik)) {
    const ok = cfg.adminPasswordHash ? await bcrypt.compare(password, cfg.adminPasswordHash) : false;
    return ok ? { nik, name: cfg.adminName, role: "admin" } : null;
  }
  const user = (await dataSource().listUsers()).find((u) => u.nik === nik && u.active && u.passwordHash);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  return ok && user ? { nik: user.nik, name: user.name, role: "viewer" } : null;
}
