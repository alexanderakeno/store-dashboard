import "server-only";
import { appConfig } from "@/config/app";
import { loginMessage, toWhatsApp, waNumber } from "@/lib/domain/notifyText";
import type { AccessEntry } from "@/types/access";

/**
 * Login notifications — WhatsApp (CallMeBot) and/or Telegram. Configured only through Vercel env
 * (never in the code: the repository is public):
 *   WHATSAPP_PHONE       number(s) that receive the message, e.g. 6281234567890 (comma-separated)
 *   WHATSAPP_APIKEY      CallMeBot API key(s), same order as WHATSAPP_PHONE
 *   TELEGRAM_BOT_TOKEN   token from @BotFather
 *   TELEGRAM_CHAT_ID     chat id(s), comma-separated
 *   NOTIFY_LOGINS        what to send: "login" (staff logins), "failed" (wrong password), "admin"
 *                        (admin logins too). Default "login,failed". (TELEGRAM_NOTIFY still works.)
 * Channels without settings are skipped. Sending never blocks or breaks a login.
 */
const env = (k: string) => (process.env[k] ?? "").trim();
const list = (k: string) => env(k).split(",").map((s) => s.trim()).filter(Boolean);


export function notifyConfig() {
  const kinds = new Set((env("NOTIFY_LOGINS") || env("TELEGRAM_NOTIFY") || "login,failed").toLowerCase().split(",").map((s) => s.trim()));
  const waPhones = list("WHATSAPP_PHONE").map(waNumber);
  const waKeys = list("WHATSAPP_APIKEY");
  const tgToken = env("TELEGRAM_BOT_TOKEN");
  const tgChats = list("TELEGRAM_CHAT_ID");
  const wa = waPhones.length > 0 && waKeys.length > 0;
  const tg = !!tgToken && tgChats.length > 0;
  return { kinds, wa, waPhones, waKeys, tg, tgToken, tgChats, ready: wa || tg };
}
const masked = (p: string) => `${p.slice(0, 4)}••••${p.slice(-3)}`;

async function sendWhatsApp(text: string): Promise<string[]> {
  const c = notifyConfig();
  const errors: string[] = [];
  for (let i = 0; i < c.waPhones.length; i++) {
    const key = c.waKeys[i] ?? c.waKeys[0];
    const url = `https://api.callmebot.com/whatsapp.php?phone=${c.waPhones[i]}&apikey=${encodeURIComponent(key)}&text=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000), cache: "no-store" }).catch((e: Error) => e);
    if (res instanceof Error) errors.push(`WhatsApp ${masked(c.waPhones[i])}: ${res.message}`);
    else {
      const body = await res.text().catch(() => "");
      // CallMeBot answers 200 with a small HTML page: "Message queued" / "sent" on success, an error text otherwise
      const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!res.ok || (!/queued|sent/i.test(text) && /error|invalid|not allowed/i.test(text))) {
        // drop the echoed "Message to: … Text to send: …" part, keep CallMeBot's own message
        const reason = text.replace(/^.*?Text to send:.*?(?=(APIKey|Error|ERROR|Phone|The |You )|$)/, "").trim() || text;
        errors.push(`WhatsApp ${masked(c.waPhones[i])}: ${reason.slice(0, 140)}`);
      }
    }
  }
  return errors;
}

async function sendTelegram(html: string): Promise<string[]> {
  const c = notifyConfig();
  const errors: string[] = [];
  for (const chat of c.tgChats) {
    const res = await fetch(`https://api.telegram.org/bot${c.tgToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    }).catch((e: Error) => e);
    if (res instanceof Error) errors.push(`Telegram: ${res.message}`);
    else if (!res.ok) errors.push(`Telegram: ${res.status} ${((await res.json().catch(() => ({}))) as { description?: string }).description ?? ""}`.trim());
  }
  return errors;
}

/** Sends one message (Telegram HTML; converted for WhatsApp) to every configured channel. Throws when all fail. */
export async function sendNotification(html: string): Promise<{ sent: string[] }> {
  const c = notifyConfig();
  if (!c.ready) throw new Error("Notifikasi belum diatur: isi WHATSAPP_PHONE + WHATSAPP_APIKEY (atau TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) di Environment Variables Vercel");
  const sent: string[] = [];
  const errors: string[] = [];
  if (c.wa) {
    const e = await sendWhatsApp(toWhatsApp(html));
    errors.push(...e);
    if (!e.length) sent.push("WhatsApp");
  }
  if (c.tg) {
    const e = await sendTelegram(html);
    errors.push(...e);
    if (!e.length) sent.push("Telegram");
  }
  if (errors.length) throw new Error(errors.join("; ") + (sent.length ? ` (terkirim: ${sent.join(", ")})` : ""));
  return { sent };
}

/** Sends the login notification if configured; errors only go to the server log. */
export async function notifyLogin(e: AccessEntry): Promise<void> {
  const c = notifyConfig();
  if (!c.ready) return;
  const cfg = appConfig();
  const msg = loginMessage(e, { kinds: c.kinds, store: cfg.storeCode || cfg.storeName || "Store", timeZone: cfg.timeZone });
  if (!msg) return;
  await sendNotification(msg).catch((err: Error) => console.error("login notify:", err.message));
}
