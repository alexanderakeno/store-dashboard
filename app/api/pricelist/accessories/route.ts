import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { invalidate } from "@/lib/cache";
import type { AccPriceItem } from "@/types/accPrice";

const MAX_ITEMS = 10_000;
const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n) : NaN;
};

/** Admin: replace the stored accessories price list with the parsed Excel rows. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ date?: unknown; source?: unknown; items?: unknown }>(req);
    const date = b.date == null || b.date === "" ? null : String(b.date);
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest("Tanggal harus YYYY-MM-DD");
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > MAX_ITEMS) throw new BadRequest("Price list aksesoris kosong atau tidak valid");

    const seen = new Set<string>();
    const items: AccPriceItem[] = [];
    for (const r of b.items as Array<Record<string, unknown>>) {
      const it: AccPriceItem = { article: str(r?.article, 40).toUpperCase(), brand: str(r?.brand, 40) || "Lainnya", description: str(r?.description, 160), category: str(r?.category, 40) || "Lainnya", srp: money(r?.srp), current: money(r?.current), price: money(r?.price) };
      if (!it.article || !it.price || Number.isNaN(it.price) || Number.isNaN(it.srp) || Number.isNaN(it.current)) throw new BadRequest(`Baris price list aksesoris tidak valid: ${it.article || "(tanpa artikel)"}`);
      const remark = str(r?.remark, 120);
      if (remark) it.remark = remark;
      if (seen.has(it.article)) continue;
      seen.add(it.article);
      items.push(it);
    }

    // what changed vs the stored list (for the summary only)
    const prev = await dataSource().getAccPriceList().catch(() => null);
    let summary = "";
    if (prev?.items.length) {
      const old = new Map(prev.items.map((x) => [x.article, x.price]));
      let up = 0;
      let down = 0;
      let added = 0;
      for (const x of items) {
        const o = old.get(x.article);
        if (o == null) added++;
        else if (x.price > o) up++;
        else if (x.price < o) down++;
      }
      summary = ` · vs import sebelumnya: ${down} turun, ${up} naik, ${added} baru`;
    }
    await dataSource().saveAccPriceList({ date, source: str(b.source, 200), items }, s.nik);
    await dataSource().audit({ nik: s.nik, action: "import.accprice", detail: `${date ?? "-"}: ${items.length} artikel` }).catch(() => {});
    invalidate("accprice");
    return NextResponse.json({ ok: true, count: items.length, message: `Price list aksesoris${date ? ` ${date.split("-").reverse().join("/")}` : ""}: ${items.length} artikel tersimpan${summary}` });
  });
}
