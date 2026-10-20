import type { AccessEntry, AccessEvent } from "@/types/access";

/** Short, readable device label from a User-Agent ("Android · Chrome", "iPhone · Safari", …). */
export function deviceFrom(ua: string | null | undefined): string {
  const s = String(ua ?? "");
  if (!s) return "";
  const os = /iPad/.test(s)
    ? "iPad"
    : /iPhone/.test(s)
      ? "iPhone"
      : /Android/.test(s)
        ? "Android"
        : /Windows/.test(s)
          ? "Windows"
          : /Macintosh|Mac OS X/.test(s)
            ? "Mac"
            : /CrOS/.test(s)
              ? "ChromeOS"
              : /Linux/.test(s)
                ? "Linux"
                : "Lainnya";
  const browser = /SamsungBrowser/.test(s)
    ? "Samsung Internet"
    : /Edg\//.test(s)
      ? "Edge"
      : /OPR\/|Opera/.test(s)
        ? "Opera"
        : /Firefox\/|FxiOS/.test(s)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(s)
            ? "Chrome"
            : /Safari\//.test(s)
              ? "Safari"
              : "";
  return browser ? `${os} · ${browser}` : os;
}

/** A page path safe to store: pathname only, no query, bounded length. Null when invalid. */
export function cleanPath(p: unknown): string | null {
  const s = String(p ?? "").split(/[?#]/)[0].trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/api/") || s.length > 120) return null;
  if (!/^[\w\-./]+$/.test(s)) return null;
  return s;
}

export const EVENT_LABEL: Record<AccessEvent, string> = {
  login: "Login",
  login_failed: "Login gagal",
  logout: "Logout",
  view: "Buka halaman",
};

export interface AccessFilter {
  nik?: string;
  /** Inclusive local dates `YYYY-MM-DD` (in `timeZone`). */
  from?: string;
  to?: string;
  /** "login" = login / login_failed / logout; "view" = page views. */
  kind?: "login" | "view" | "";
  timeZone: string;
}

/** Local calendar date of an ISO timestamp in `timeZone`. */
export function localDate(ts: string, timeZone: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function filterAccess(entries: AccessEntry[], f: AccessFilter): AccessEntry[] {
  return entries.filter((e) => {
    if (f.nik && e.nik !== f.nik) return false;
    if (f.kind === "view" && e.event !== "view") return false;
    if (f.kind === "login" && e.event === "view") return false;
    if (f.from || f.to) {
      const d = localDate(e.ts, f.timeZone);
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
    }
    return true;
  });
}

export interface AccessSummaryRow {
  nik: string;
  name: string;
  role: string;
  logins: number;
  failed: number;
  views: number;
  /** Distinct local days with any successful activity. */
  days: number;
  lastLogin: string | null;
  lastSeen: string | null;
  lastDevice: string;
}

/**
 * One row per known account (plus any NIK seen in the log): newest activity first, then
 * accounts with failed logins, then accounts that never opened the dashboard.
 * `entries` must already be filtered to the period of interest.
 */
export function summarizeAccess(entries: AccessEntry[], accounts: Array<{ nik: string; name: string; role: string }>, timeZone: string): AccessSummaryRow[] {
  const rows = new Map<string, AccessSummaryRow & { daySet: Set<string> }>();
  const get = (nik: string, name = "", role = "") => {
    let r = rows.get(nik);
    if (!r) {
      r = { nik, name, role, logins: 0, failed: 0, views: 0, days: 0, lastLogin: null, lastSeen: null, lastDevice: "", daySet: new Set() };
      rows.set(nik, r);
    }
    if (!r.name && name) r.name = name;
    if (!r.role && role) r.role = role;
    return r;
  };
  for (const a of accounts) get(a.nik, a.name, a.role);
  for (const e of entries) {
    if (!e.nik) continue;
    const r = get(e.nik, e.name, e.role);
    if (e.event === "login_failed") {
      r.failed++;
      continue;
    }
    if (e.event === "login") {
      r.logins++;
      if (!r.lastLogin || e.ts > r.lastLogin) r.lastLogin = e.ts;
    }
    if (e.event === "view") r.views++;
    if (!r.lastSeen || e.ts > r.lastSeen) {
      r.lastSeen = e.ts;
      if (e.device) r.lastDevice = e.device;
    }
    r.daySet.add(localDate(e.ts, timeZone));
  }
  return [...rows.values()]
    .map(({ daySet, ...r }) => ({ ...r, days: daySet.size }))
    .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") || b.failed - a.failed || a.name.localeCompare(b.name));
}
