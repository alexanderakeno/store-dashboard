"use client";

/** Vercel rejects request bodies above ~4.5 MB. */
export const MAX_UPLOAD_BYTES = 4_300_000;

/**
 * POSTs JSON, gzipped when the browser supports it and the body is big enough to matter
 * (raw MR/SP rows shrink 5–10×). The server's `jsonBody` un-gzips it. Throws when the
 * body that would be sent is over Vercel's limit.
 */
export async function postJson(url: string, data: unknown): Promise<Response> {
  const json = JSON.stringify(data);
  const canGzip = typeof CompressionStream !== "undefined" && json.length > 20_000;
  if (canGzip) {
    let gz: Blob | null = null;
    try {
      gz = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
    } catch {
      gz = null; // compression unavailable in this browser — send plain JSON below
    }
    if (gz) {
      if (gz.size > MAX_UPLOAD_BYTES) throw new TooBig(gz.size);
      return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Body-Encoding": "gzip" }, body: gz });
    }
  }
  if (json.length > MAX_UPLOAD_BYTES) throw new TooBig(json.length);
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: json });
}

export class TooBig extends Error {
  constructor(bytes: number) {
    super(`Data terlalu besar (${Math.round(bytes / 1024)} KB setelah dikompres). Import MR dan Sales Person satu per satu.`);
  }
}
