import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { BadRequest, handle } from "@/lib/http";
import { appConfig } from "@/config/app";
import { getSoh } from "@/lib/soh";
import { getAccPriceList } from "@/lib/accPrice";
import { getPriceList } from "@/lib/pricelist";
import { skuPrices } from "@/lib/domain/skuPrice";
import { scanLookup, normCode, type DevicePrice } from "@/lib/domain/scan";
import { todayIn } from "@/lib/domain/period";
import { getMonthSnapshot } from "@/lib/services/dashboard";
import type { SohItem } from "@/types/soh";

/** Scan Harga: a scanned barcode / typed code → article, price and stock (any signed-in user). */
export async function GET(req: Request) {
  return handle(async () => {
    if (!(await getSession())) return NextResponse.json({ error: "Sesi berakhir, silakan login ulang" }, { status: 401 });
    const code = (new URL(req.url).searchParams.get("code") ?? "").trim().slice(0, 40);
    if (normCode(code).length < 4) throw new BadRequest("Kode terlalu pendek");
    const [soh, acc, list] = await Promise.all([getSoh().catch(() => null), getAccPriceList().catch(() => null), getPriceList().catch(() => null)]);
    // device price: the Android / Apple price list row of this one article (same matching as the SOH page)
    const device = (item: SohItem): DevicePrice | null => {
      const p = skuPrices(list, [item]);
      const hit = p.byArticle[item.article.toUpperCase()];
      if (!hit) return null;
      const m = p.models[hit[0]];
      const v = m.variants[hit[1]];
      return { price: v.promo, normal: v.normal, name: v.name, brand: m.brand, ...(v.note ? { note: v.note } : {}) };
    };
    const hit = scanLookup(code, soh?.items ?? [], acc?.items ?? [], device);
    if (!hit) return NextResponse.json({ hit: null, sohDate: soh?.date ?? null }, { headers: { "Cache-Control": "private, no-store" } });
    // sold this month (optional — never blocks the price)
    let sold: number | null = null;
    try {
      const snap = await getMonthSnapshot(todayIn(appConfig().timeZone).slice(0, 7));
      const a = hit.article.toUpperCase();
      sold = snap.lines.filter((l) => l.article.toUpperCase() === a).reduce((s, l) => s + l.qty, 0);
    } catch {}
    return NextResponse.json({ hit: { ...hit, sold }, sohDate: soh?.date ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  });
}
