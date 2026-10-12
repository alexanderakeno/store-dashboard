import "server-only";

/** App identity + infrastructure config, read from env only (never hard-coded). */
export interface AppConfig {
  appName: string;
  storeName: string;
  storeCode: string;
  storeLocation: string;
  timeZone: string;
  currency: string;
  dataSource: "sheets" | "fixture";
  masterSheetId: string;
  serviceAccountEmail: string;
  privateKey: string;
  salesSheetName: string;
  targetSheetName: string;
  sessionSecret: string;
  adminNik: string;
  adminPasswordHash: string;
  adminName: string;
  cacheTtlMs: number;
  importWebAppUrl: string;
}

const env = (k: string, d = "") => (process.env[k] ?? d).trim();

let cached: AppConfig | null = null;

export function appConfig(): AppConfig {
  if (cached) return cached;
  const dataSource = env("DATA_SOURCE", "sheets") === "fixture" ? "fixture" : "sheets";
  const cfg: AppConfig = {
    appName: env("APP_NAME", "Store Dashboard"),
    storeName: env("STORE_NAME"),
    storeCode: env("STORE_CODE"),
    storeLocation: env("STORE_LOCATION"),
    timeZone: env("TIMEZONE", "Asia/Jakarta"),
    currency: env("CURRENCY", "IDR"),
    dataSource,
    masterSheetId: env("MASTER_SHEET_ID"),
    serviceAccountEmail: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: env("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n").replace(/^"|"$/g, ""),
    salesSheetName: env("SALES_SHEET_NAME", "Control MR &SP"),
    targetSheetName: env("TARGET_SHEET_NAME", "Target Store"),
    sessionSecret: env("SESSION_SECRET"),
    adminNik: env("ADMIN_NIK"),
    adminPasswordHash: env("ADMIN_PASSWORD_HASH"),
    adminName: env("ADMIN_NAME", "Admin"),
    cacheTtlMs: Number(env("CACHE_TTL_SECONDS", "300")) * 1000 || 300_000,
    importWebAppUrl: env("IMPORT_WEBAPP_URL", "https://script.google.com/macros/s/AKfycbywTzsBtldn7KyN3Mhsnc9N72y7nAA9Q4UKj7TYCKYTjCrI_QaBVzvQDeDRaq5DyP9C9A/exec"),
  };
  cached = cfg;
  return cfg;
}

/** Problems that make the app unusable — shown on the login page instead of crashing. */
export function configProblems(cfg = appConfig()): string[] {
  const p: string[] = [];
  if (cfg.sessionSecret.length < 32) p.push("SESSION_SECRET belum diisi / kurang dari 32 karakter");
  if (!cfg.adminNik || !cfg.adminPasswordHash) p.push("ADMIN_NIK / ADMIN_PASSWORD_HASH belum diisi");
  if (cfg.dataSource === "sheets") {
    if (!cfg.masterSheetId) p.push("MASTER_SHEET_ID belum diisi");
    if (!cfg.serviceAccountEmail || !cfg.privateKey) p.push("Kredensial service account Google belum diisi");
  }
  return p;
}
