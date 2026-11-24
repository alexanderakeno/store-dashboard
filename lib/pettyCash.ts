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
{"isReceipt": true, "date": "YYYY-MM-DD", "merchant": "nama toko singkat", "items": "ringkasan barang", "total": 12345, "account": "sundries", "confident": true}

Aturan:
- isReceipt=false jika halaman bukan struk/invoice (mis. halaman kosong / lanjutan tanpa total).
- date = tanggal transaksi pada struk. Format Indonesia DD/MM/YYYY atau DD-MM-YYYY (hari dulu, lalu bulan).
- merchant: nama singkat toko/platform, mis. "Snapy", "Shopee", "Tokopedia", "Transmart", "Paperclip", "Indomaret".
- items: ringkas dalam bahasa Indonesia, maksimal ±8 kata, gabungkan barang dengan koma / "+", tanpa qty dan harga. Contoh: "Sticker A3 matte + print color A3", "Tisu, pengharum, pembersih kaca & lantai", "Tas spunbond goodie bag".
- total = jumlah yang benar-benar dibayar (Grand Total / Total Pembayaran / Total Tagihan, termasuk ongkir, biaya layanan dan potongan voucher). Angka bulat Rupiah tanpa titik/koma. "47,152" atau "47.152" = 47152.
- account: "transport" (ojek/taksi/parkir/tol/bensin), "freight" (biaya kirim barang/ekspedisi saja), "stationery" (hanya jika jelas ATK murni), "bank" (biaya admin bank/transfer), selain itu "sundries" (perlengkapan toko, print, kebersihan, goodie bag, ATK campuran).
- confident=false jika tanggal atau total tidak terbaca jelas.`;

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
    const model = env("PETTY_CASH_AI_MODEL") || "gemini-2.5-flash";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY") },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: jpegBase64 } }, { text: PROMPT }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
      signal: AbortSignal.timeout(55_000),
    });
    const j = (await res.json().catch(() => null)) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } } | null;
    if (!res.ok) throw new Error(`AI error ${res.status}: ${j?.error?.message ?? "gagal"}`);
    text = j?.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "";
  }
  return normalizeExtract(parseJson(text));
}
