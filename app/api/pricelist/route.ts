import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { invalidate } from "@/lib/cache";
import type { PriceItem, PriceKind, QoalaTier } from "@/types/pricelist";

const MAX_ITEMS = 3_000;
const KINDS: PriceKind[] = ["apple", "android"];
const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e11 ? Math.round(n) : NaN;
};

/** Admin: replace the stored price list (only the kinds present in the uploaded PDF) with the parsed rows. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ date?: unknown; source?: unknown; items?: unknown; qoala?: unknown }>(req);
    const date = b.date == null || b.date === "" ? null : String(b.date);
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest("Tanggal harus YYYY-MM-DD");
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > MAX_ITEMS) throw new BadRequest("Price list kosong atau tidak valid");

    const items: PriceItem[] = b.items.map((r: Record<string, unknown>) => {
      const it = { kind: str(r?.kind, 10) as PriceKind, brand: str(r?.brand, 40), series: str(r?.series, 120), name: str(r?.name, 160), normal: money(r?.normal), promo: money(r?.promo), status: str(r?.status, 30).toUpperCase() || "ACTIVE" };
      if (!KINDS.includes(it.kind) || !it.name || Number.isNaN(it.normal) || Number.isNaN(it.promo)) throw new BadRequest(`Baris price list tidak valid: ${it.name || "(tanpa nama)"}`);
      return it;
    });
    const qoala: QoalaTier[] = (Array.isArray(b.qoala) ? b.qoala : []).slice(0, 30).map((q: Record<string, unknown>) => ({
      tier: str(q?.tier, 40),
      range: str(q?.range, 80),
      fees: Object.fromEntries(Object.entries((q?.fees as Record<string, unknown>) ?? {}).slice(0, 6).map(([k, v]) => [str(k, 4), money(v)]).filter(([, v]) => !Number.isNaN(v))),
    })).filter((q) => q.tier);

    const kinds = [...new Set(items.map((x) => x.kind))];
    await dataSource().savePriceList({ kinds, date, source: str(b.source, 200), items, qoala }, s.nik);
    await dataSource().audit({ nik: s.nik, action: "import.pricelist", detail: `${date ?? "-"}: ${kinds.join("+")} ${items.length} tipe, qoala ${qoala.length}` }).catch(() => {});
    invalidate("pricelist:");
    const label = kinds.map((k) => (k === "apple" ? "Apple" : "Android")).join(" & ");
    return NextResponse.json({ ok: true, message: `${label}: ${items.length} tipe${qoala.length ? ` · ${qoala.length} tier Qoala` : ""} tersimpan` });
  });
}
