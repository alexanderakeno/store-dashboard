import type { AccessEntry } from "@/types/access";

/** Pure text builders for the Telegram login notifications (lib/notify.ts sends them). */
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** "Sab, 1 Nov 2026 09:12 WIB" in the store's time zone. */
function when(iso: string, tz: string): string {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("id-ID", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${f.replace(/\./g, ":").replace(/(\d{2}):(\d{2})$/, "$1:$2")} ${tz === "Asia/Jakarta" ? "WIB" : tz}`;
}

// a burst of wrong passwords for one NIK sends one message per 10 minutes
const lastFailed = new Map<string, number>();
const FAILED_QUIET_MS = 10 * 60 * 1000;

/** Message for a login / failed login, or null when that kind is switched off. */
export function loginMessage(e: AccessEntry, opt: { kinds: Set<string>; store: string; timeZone: string }, now = Date.now()): string | null {
  const { kinds, store } = opt;
  const where = [e.device, e.location].filter(Boolean).join(" · ");
  if (e.event === "login") {
    if (e.role === "admin" ? !kinds.has("admin") : !kinds.has("login")) return null;
    return [`🔐 <b>Login dashboard ${esc(store)}</b>`, `Nama: <b>${esc(e.name || "-")}</b> (${esc(e.nik)})${e.role === "admin" ? " · admin" : ""}`, `Waktu: ${esc(when(e.ts, opt.timeZone))}`, where && `Perangkat: ${esc(where)}`].filter(Boolean).join("\n");
  }
  if (e.event === "login_failed") {
    if (!kinds.has("failed")) return null;
    const last = lastFailed.get(e.nik) ?? 0;
    if (now - last < FAILED_QUIET_MS) return null;
    lastFailed.set(e.nik, now);
    return [`⚠️ <b>Login gagal ${esc(store)}</b>`, `NIK: ${esc(e.nik)} (password salah)`, `Waktu: ${esc(when(e.ts, opt.timeZone))}`, where && `Perangkat: ${esc(where)}`, e.ip && `IP: ${esc(e.ip)}`].filter(Boolean).join("\n");
  }
  return null;
}

