/** Who logged in / opened which page (master sheet `APP_Access`). */
export type AccessEvent = "login" | "login_failed" | "logout" | "view";

export const ACCESS_EVENTS: readonly AccessEvent[] = ["login", "login_failed", "logout", "view"];

export interface AccessEntry {
  /** ISO timestamp (UTC). */
  ts: string;
  nik: string;
  /** Account name at the time (empty for a failed login with an unknown NIK). */
  name: string;
  role: "admin" | "viewer" | "";
  event: AccessEvent;
  /** Pathname without query string (views only). */
  path: string;
  ip: string;
  /** City / region / country from the hosting edge, when known. */
  location: string;
  /** e.g. "Android · Chrome". */
  device: string;
}
