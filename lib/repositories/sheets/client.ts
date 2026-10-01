import "server-only";
import { JWT } from "google-auth-library";
import { appConfig } from "@/config/app";
import type { Grid } from "@/lib/parsers/controlSheet";

/**
 * Minimal Google Sheets v4 REST client (service account).
 * Reads use UNFORMATTED_VALUE + SERIAL_NUMBER dates so numbers/dates arrive
 * as numbers; the parsers also accept id-ID formatted strings.
 */
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

let jwt: JWT | null = null;
function auth(): JWT {
  if (jwt) return jwt;
  const cfg = appConfig();
  if (!cfg.serviceAccountEmail || !cfg.privateKey) throw new SheetsError("Kredensial service account Google belum diisi", 500);
  jwt = new JWT({ email: cfg.serviceAccountEmail, key: cfg.privateKey, scopes: SCOPES });
  return jwt;
}

export class SheetsError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const { token } = await auth().getAccessToken();
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) msg = body.error.message;
    } catch {}
    if (res.status === 403) msg = `Akses ditolak — bagikan sheet ke ${appConfig().serviceAccountEmail}. (${msg})`;
    if (res.status === 404) msg = `Spreadsheet tidak ditemukan. (${msg})`;
    throw new SheetsError(msg, res.status);
  }
  return (await res.json()) as T;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const enc = encodeURIComponent;

/** Accepts a full Google Sheets URL or a bare spreadsheet ID. */
export function spreadsheetIdFrom(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(s) ? s : null;
}

export async function getSpreadsheetMeta(id: string): Promise<{ title: string; sheets: string[] }> {
  const r = await call<{ properties: { title: string }; sheets: Array<{ properties: { title: string } }> }>(
    `${BASE}/${id}?fields=properties.title,sheets.properties.title`,
  );
  return { title: r.properties.title, sheets: r.sheets.map((s) => s.properties.title) };
}

/** Whole tab (or A1 range inside it) as a 2D grid. */
export async function readTab(id: string, tab: string, range?: string): Promise<Grid> {
  const a1 = range ? `${q(tab)}!${range}` : q(tab);
  const r = await call<{ values?: Grid }>(
    `${BASE}/${id}/values/${enc(a1)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS`,
  );
  return r.values ?? [];
}

export async function readTabs(id: string, tabs: string[]): Promise<Record<string, Grid>> {
  const params = tabs.map((t) => `ranges=${enc(q(t))}`).join("&");
  const r = await call<{ valueRanges: Array<{ values?: Grid }> }>(
    `${BASE}/${id}/values:batchGet?${params}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
  );
  const out: Record<string, Grid> = {};
  tabs.forEach((t, i) => (out[t] = r.valueRanges[i]?.values ?? []));
  return out;
}

export async function addTab(id: string, tab: string, header: string[]): Promise<void> {
  await call(`${BASE}/${id}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }] }),
  });
  await writeRange(id, tab, "A1", [header]);
}

export async function writeRange(id: string, tab: string, a1: string, values: unknown[][]): Promise<void> {
  await call(`${BASE}/${id}/values/${enc(`${q(tab)}!${a1}`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
}

export async function appendRows(id: string, tab: string, values: unknown[][]): Promise<void> {
  await call(`${BASE}/${id}/values/${enc(`${q(tab)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values }),
  });
}

export async function clearRange(id: string, tab: string, a1: string): Promise<void> {
  await call(`${BASE}/${id}/values/${enc(`${q(tab)}!${a1}`)}:clear`, { method: "POST", body: "{}" });
}
