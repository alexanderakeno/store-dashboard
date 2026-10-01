import { SignJWT, jwtVerify } from "jose";

/** Session token helpers — dependency-light so the proxy can use them too. */
export const SESSION_COOKIE = "sd_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface Session {
  nik: string;
  name: string;
  role: "admin" | "viewer";
}

function key(): Uint8Array {
  const s = (process.env.SESSION_SECRET ?? "").trim();
  if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ name: s.name, role: s.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.nik)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const role = payload.role === "admin" ? "admin" : "viewer";
    if (!payload.sub) return null;
    return { nik: payload.sub, name: String(payload.name ?? payload.sub), role };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
