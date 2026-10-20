import "server-only";
import { after } from "next/server";
import type { Session } from "@/lib/auth/token";
import { deviceFrom } from "@/lib/domain/access";
import { dataSource } from "@/lib/repositories";
import type { AccessEntry, AccessEvent } from "@/types/access";

function header(req: Request, name: string): string {
  return (req.headers.get(name) ?? "").trim();
}

function decode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** IP, rough location (Vercel edge headers) and device of the request. */
export function clientInfo(req: Request): Pick<AccessEntry, "ip" | "location" | "device"> {
  const ip = header(req, "x-forwarded-for").split(",")[0].trim() || header(req, "x-real-ip") || "local";
  const location = [decode(header(req, "x-vercel-ip-city")), header(req, "x-vercel-ip-country-region"), header(req, "x-vercel-ip-country")].filter(Boolean).join(", ");
  return { ip: ip.slice(0, 64), location: location.slice(0, 80), device: deviceFrom(header(req, "user-agent")).slice(0, 60) };
}

// Same account + same page within this window is logged once (per server instance).
const VIEW_DEDUPE_MS = 2 * 60 * 1000;
const lastView = new Map<string, number>();

/**
 * Records an access event after the response is sent, so logging never slows down or
 * breaks a login or a page load. Failures are only written to the server log.
 */
export function recordAccess(req: Request, event: AccessEvent, who: Pick<Session, "nik"> & Partial<Pick<Session, "name" | "role">>, path = ""): void {
  if (event === "view") {
    const key = `${who.nik}|${path}`;
    const now = Date.now();
    if (now - (lastView.get(key) ?? 0) < VIEW_DEDUPE_MS) return;
    lastView.set(key, now);
    if (lastView.size > 2000) for (const [k, t] of lastView) if (now - t > VIEW_DEDUPE_MS) lastView.delete(k);
  }
  const entry: AccessEntry = {
    ts: new Date().toISOString(),
    nik: who.nik.slice(0, 32),
    name: (who.name ?? "").slice(0, 80),
    role: who.role ?? "",
    event,
    path,
    ...clientInfo(req),
  };
  after(() => dataSource().logAccess([entry]).catch((e) => console.error("access log:", e)));
}
