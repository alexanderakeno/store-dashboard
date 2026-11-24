import "server-only";
import { normalizeExtract } from "@/lib/domain/pettyCash";

/**
 * Reads one receipt / invoice photo with a vision model.
 * Provider from env: ANTHROPIC_API_KEY (Claude) or GEMINI_API_KEY (Gemini). Model overridable with PETTY_CASH_AI_MODEL.
 */
const env = (k: string) => (process.env[k] ?? "").trim();

export function aiProvider(): "anthropic" | "gemini" | null {
  if (env("ANTHROPIC_API_KEY")) return "anthropic";
  if (env("GEMINI_API_KEY")) return "gemini";
  return null;
}

const PROMPT = `Kamu membaca SATU foto struk / invoice / nota pesanan untuk klaim petty cash toko di Indonesia.
Balas HANYA JSON (tanpa teks lain) dengan bentuk:
{"isReceipt": true, "date": "YYYY-MM-DD", "merchant": "nama toko singkat", "items": "ringkasan barang", "total": 12345, "confident": true}

Aturan:
- isReceipt=false HANYA jika halaman tidak berisi transaksi sama sekali (kosong, syarat & ketentuan, iklan).
- Invoice / nota marketplace (Shopee, Tokopedia) bisa 2 halaman: isi apa yang ada di halaman ini saja — halaman 1 biasanya tanggal + barang (total boleh 0), halaman terakhir biasanya hanya Total Pembayaran (date boleh "").
- date = tanggal transaksi pada struk. Format Indonesia DD/MM/YYYY atau DD-MM-YYYY (hari dulu, lalu bulan); "Wed, 28-Oct-2026" = 2026-10-28. Baca TAHUN dengan teliti (struk tahun ini biasanya 2026); tahun 2 digit "26" = 2026.
- merchant: nama singkat toko/platform, mis. "Snapy", "Shopee", "Tokopedia", "Transmart", "Paperclip", "Indomaret".
- items: ringkas dalam bahasa Indonesia, maksimal ±8 kata, gabungkan barang dengan koma / "+", tanpa qty, ukuran, gramasi dan harga. Tulis nama barang yang umum, bukan singkatan di struk ("TAPE D FOAM 3M" = "Double tape foam 3M", "WPL KBL LEMON" = pembersih lantai). Merek boleh ditulis kalau jelas (Baygon, Vela, Kenko, HP 682).
- Struk jasa print (Snapy dll.): tulis jasa print + bahan non-kertas saja ("Plastik laminating + print color A4", "Print color A3"); kertas (HVS, AC 260, art paper) tidak perlu ditulis.
- total = jumlah yang benar-benar dibayar (Grand Total / Total Pembayaran / Total Tagihan, termasuk ongkir, biaya layanan dan potongan voucher). Angka bulat Rupiah tanpa titik/koma. "47,152" atau "47.152" = 47152.
- confident=false jika tanggal atau total tidak terbaca jelas.
Contoh hasil yang benar dari form petty cash toko (items + merchant):
- "Sticker A3 matte + print color A3" (Snapy) · "Plastik laminating + print color A4" (Snapy) · "Print color A3" (Snapy)
- "Tas spunbond goodie bag" (Shopee) · "Amplop coklat + spidol whiteboard" (Shopee) · "Tisu gantung Vela" (Tokopedia)
- "Tisu, pengharum, Baygon, pembersih kaca & lantai" (Transmart)
- "Tape dispenser Kenko" (Paperclip) · "Tinta printer HP 682" (Paperclip) · "Double tape foam 3M" (Paperclip)`;

export interface Extracted {
  isReceipt: boolean;
  date: string;
  description: string;
  account: ReturnType<typeof normalizeExtract>["account"];
  amount: number;
  uncertain: boolean;
}

function parseJson(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI tidak mengembalikan data");
  return JSON.parse(m[0]);
}

/** Gemini models tried in order (newest first) when PETTY_CASH_AI_MODEL is not set. */
export const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash", "gemini-2.5-flash"];
/** The model that answered last time on this server instance — tried first. */
let geminiOk = "";

export async function extractReceipt(jpegBase64: string): Promise<Extracted> {
  const p = aiProvider();
  if (!p) throw new Error("Pembacaan otomatis belum aktif: isi ANTHROPIC_API_KEY atau GEMINI_API_KEY di Vercel");
  let text = "";
  if (p === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: env("PETTY_CASH_AI_MODEL") || "claude-sonnet-5-5",
        max_tokens: 400,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpegBase64 } }, { type: "text", text: PROMPT }] }],
      }),
      signal: AbortSignal.timeout(55_000),
    });
    const j = (await res.json().catch(() => null)) as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } } | null;
    if (!res.ok) throw new Error(`AI error ${res.status}: ${j?.error?.message ?? "gagal"}`);
    text = j?.content?.find((c) => c.type === "text")?.text ?? "";
  } else {
    // Google retires model names and newer ones are sometimes overloaded; try newest first and stick to the first one that answers
    const models = [...new Set([env("PETTY_CASH_AI_MODEL"), geminiOk, ...GEMINI_MODELS].filter(Boolean))];
    type GeminiReply = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
    let j: GeminiReply | null = null;
    for (const model of models) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY") },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: jpegBase64 } }, { text: PROMPT }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
        signal: AbortSignal.timeout(55_000),
      });
      j = (await res.json().catch(() => null)) as GeminiReply | null;
      // retired (404), busy (503 / 500) or out of quota for this model (429): the next model usually answers
      if ([404, 429, 500, 503].includes(res.status) && model !== models[models.length - 1]) continue;
      if (!res.ok) throw new Error(`AI error ${res.status}: ${(j as GeminiReply | null)?.error?.message ?? "gagal"}`);
      geminiOk = model;
      break;
    }
    const reply = j as GeminiReply | null;
    text = reply?.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "";
  }
  return normalizeExtract(parseJson(text));
}
