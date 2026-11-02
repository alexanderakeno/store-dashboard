import "server-only";
import { appConfig } from "@/config/app";
import { loginMessage } from "@/lib/domain/notifyText";
import type { AccessEntry } from "@/types/access";

/**
 * Login notifications to Telegram (bot API). Configured only through Vercel env:
 *   TELEGRAM_BOT_TOKEN   token from @BotFather
 *   TELEGRAM_CHAT_ID     chat id(s) that receive the message, comma-separated
 *   TELEGRAM_NOTIFY      what to send (comma-separated): "login" (viewer logins), "failed" (wrong
 *                        password), "admin" (admin logins too). Default: "login,failed".
 * Without a token / chat id nothing is sent. Sending never blocks or breaks a login.
 */
const env = (k: string) => (process.env[k] ?? "").trim();

export function telegramConfig() {
  const token = env("TELEGRAM_BOT_TOKEN");
  const chats = env("TELEGRAM_CHAT_ID").split(",").map((s) => s.trim()).filter(Boolean);
  const kinds = new Set((env("TELEGRAM_NOTIFY") || "login,failed").toLowerCase().split(",").map((s) => s.trim()));
  return { token, chats, kinds, ready: !!token && chats.length > 0 };
}

export async function sendTelegram(html: string): Promise<void> {
  const { token, chats, ready } = telegramConfig();
  if (!ready) throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diisi di Environment Variables Vercel");
  const errors: string[] = [];
  for (const chat of chats) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    }).catch((e: Error) => e);
    if (res instanceof Error) errors.push(res.message);
    else if (!res.ok) errors.push(`${res.status} ${((await res.json().catch(() => ({}))) as { description?: string }).description ?? ""}`.trim());
  }
  if (errors.length) throw new Error(`Telegram: ${errors.join("; ")}`);
}

/** Sends the login notification if configured; errors only go to the server log. */
export async function notifyLogin(e: AccessEntry): Promise<void> {
  if (!telegramConfig().ready) return;
  const t = telegramConfig();
  const cfg = appConfig();
  const msg = loginMessage(e, { kinds: t.kinds, store: cfg.storeCode || cfg.storeName || "Store", timeZone: cfg.timeZone });
  if (!msg) return;
  await sendTelegram(msg).catch((err: Error) => console.error("login notify:", err.message));
}
