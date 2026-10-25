import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { invalidate } from "@/lib/cache";
import type { SohItem } from "@/types/soh";

const MAX_ITEMS = 5_000;
const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Admin: replace the stored Stock On Hand with the articles parsed from the SOH PDF or Stock Position Report Excel. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ date?: unknown; source?: unknown; items?: unknown }>(req);
    const date = b.date == null || b.date === "" ? null : String(b.date);
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest("Tanggal harus YYYY-MM-DD");
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > MAX_ITEMS) throw new BadRequest("Data SOH kosong atau tidak valid");
    const items: SohItem[] = b.items.map((r: Record<string, unknown>) => {
      const item = { category: str(r?.category, 60), article: str(r?.article, 60), description: str(r?.description, 200), qty: Number(r?.qty) };
      if (!item.category || !item.article || !Number.isInteger(item.qty)) throw new BadRequest(`Baris SOH tidak valid: ${item.article || "(tanpa artikel)"}`);
      return item;
    });
    const categories = [...new Set(items.map((x) => x.category))];
    await dataSource().saveSoh({ date, categories, items, source: str(b.source, 200) }, s.nik);
    const qty = items.reduce((a, x) => a + x.qty, 0);
    await dataSource().audit({ nik: s.nik, action: "import.soh", detail: `${date ?? "-"}: ${items.length} artikel, qty ${qty}` }).catch(() => {});
    invalidate("soh:");
    return NextResponse.json({ ok: true, message: `${items.length} artikel · ${categories.length} kategori · total qty ${qty}` });
  });
}
