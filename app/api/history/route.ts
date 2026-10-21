import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { invalidateHistory } from "@/lib/services/dashboard";
import type { MerchLine } from "@/types/domain";

export const maxDuration = 60;

const MAX_ROWS = 20_000;
const str = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

/**
 * Admin: store one month of last-year Merchandise Report (parsed in the browser) in the master
 * sheet tab APP_History, replacing that month. Used by LFL / YTD / Compare when the month has no
 * registered monthly file. An empty `rows` removes the month.
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ month?: string; source?: string; rows?: unknown }>(req);
    const month = str(b.month, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequest("Format bulan harus YYYY-MM");
    if (!Array.isArray(b.rows) || b.rows.length > MAX_ROWS) throw new BadRequest("Data baris tidak valid");
    const rows: MerchLine[] = [];
    for (const r of b.rows as Array<Record<string, unknown>>) {
      const date = str(r?.date, 10);
      const x: MerchLine = {
        date,
        brand: str(r.brand, 60),
        division: str(r.division, 60),
        productGroup: str(r.productGroup, 40),
        category: str(r.category, 60),
        article: str(r.article, 60),
        description: str(r.description, 160),
        qty: n(r.qty),
        discount: n(r.discount),
        net: n(r.net),
      };
      if (!date.startsWith(month) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest(`Ada baris di luar bulan ${month} (${date || "tanpa tanggal"})`);
      if ([x.qty, x.discount, x.net].some(Number.isNaN)) throw new BadRequest("Ada qty / discount / net yang bukan angka");
      rows.push(x);
    }
    const source = str(b.source, 120) || "upload";
    await dataSource().saveHistory(month, rows, source, s.nik);
    await dataSource().audit({ nik: s.nik, action: "import.history", detail: `${month}: ${rows.length} baris (${source})` }).catch(() => {});
    invalidateHistory();
    return NextResponse.json({ ok: true, month, lines: rows.length, net: rows.reduce((a, x) => a + x.net, 0) });
  });
}
