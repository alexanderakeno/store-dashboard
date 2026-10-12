import "server-only";
import { JWT } from "google-auth-library";
import { appConfig } from "@/config/app";

/** Raw sheet rows as read by SheetJS (`sheet_to_json(ws, { header: 1, raw: true })`). */
export type RawRows = Array<Array<string | number | boolean | null>>;

/** Must match IMPORT_AUDIENCE in Apps Script WebApi.gs. */
const AUDIENCE = "store-dashboard-import-raw";

let jwt: JWT | null = null;

/**
 * Google-signed ID token of the app's service account. Apps Script verifies it
 * (issuer, audience, email), so no shared secret is needed.
 */
async function idToken(): Promise<string> {
  const cfg = appConfig();
  if (!cfg.serviceAccountEmail || !cfg.privateKey) throw new Error("Kredensial service account Google belum diisi");
  jwt ??= new JWT({ email: cfg.serviceAccountEmail, key: cfg.privateKey });
  return jwt.fetchIdToken(AUDIENCE);
}

/**
 * Forwards parsed raw files to the Apps Script web app (`doPost` in WebApi.gs), which
 * runs the same `importRaw()` as the "Import Raw" menu in Google Sheets.
 * The app itself never writes to the monthly sheet — Apps Script does, as the sheet owner.
 */
export async function forwardImportRaw(spreadsheetId: string, mr: RawRows | null, sp: RawRows | null): Promise<{ message: string }> {
  const url = appConfig().importWebAppUrl;
  if (!url) throw new Error("IMPORT_WEBAPP_URL belum diisi di Environment Variables Vercel");
  const token = await idToken();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, sheetId: spreadsheetId, mr, sp }),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
  } catch (e) {
    const timeout = (e as Error).name === "TimeoutError";
    throw new Error(timeout ? "Apps Script tidak merespon (timeout). Cek sheet — import mungkin tetap selesai." : `Gagal menghubungi Apps Script: ${(e as Error).message}`);
  }
  const text = await res.text();
  let j: { ok?: boolean; message?: string; error?: string };
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`Respon Apps Script bukan JSON (HTTP ${res.status}). Cek deployment Web App: Execute as "Me", Who has access "Anyone".`);
  }
  if (!j.ok) throw new Error(j.error || "Import gagal di Apps Script");
  return { message: j.message ?? "Selesai." };
}
