import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource, type HistoryInput } from "@/lib/repositories";
import { invalidateHistory } from "@/lib/services/dashboard";
import type { MerchLine } from "@/types/domain";

export const maxDuration = 60;

/** Rows accepted per request (a year and a half of Merchandise Report is ~14k). */
const MAX_ROWS = 25_000;
const MAX_MONTHS = 36;
const str = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

function parseMonth(b: { month?: unknown; source?: unknown; rows?: unknown }): HistoryInput {
  const month = str(b.month, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequest("Format bulan harus YYYY-MM");
  if (!Array.isArray(b.rows)) throw new BadRequest(`Data baris ${month} tidak valid`);
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
    if ([x.qty, x.discount, x.net].some(Number.isNaN)) throw new BadRequest(`Ada qty / discount / net yang bukan angka (${month})`);
    rows.push(x);
  }
  return { month, rows, source: str(b.source, 120) || "upload" };
}

/**
 * Admin: store Merchandise Report history months (parsed in the browser) in the master sheet tab
 * APP_History, replacing those months — all months of one upload in a single write. Accepts
 * `{ months: [{ month, source, rows }] }` (or one `{ month, source, rows }`). Empty `rows` removes a month.
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ months?: unknown; month?: unknown; source?: unknown; rows?: unknown }>(req);
    const list = Array.isArray(b.months) ? (b.months as Array<Record<string, unknown>>) : [b];
    if (!list.length || list.length > MAX_MONTHS) throw new BadRequest("Jumlah bulan tidak valid");
    const months = list.map(parseMonth);
    if (new Set(months.map((m) => m.month)).size !== months.length) throw new BadRequest("Ada bulan yang dikirim dua kali");
    const total = months.reduce((a, m) => a + m.rows.length, 0);
    if (total > MAX_ROWS) throw new BadRequest(`Terlalu banyak baris sekaligus (${total}) — upload sebagian bulan dulu`);
    try {
      await dataSource().saveHistory(months, s.nik);
    } finally {
      invalidateHistory(); // even after an error: part of the write may already be in the sheet
    }
    await dataSource()
      .audit({ nik: s.nik, action: "import.history", detail: months.map((m) => `${m.month}:${m.rows.length}`).join(" ") })
      .catch(() => {});
    return NextResponse.json({ ok: true, months: months.map((m) => ({ month: m.month, lines: m.rows.length, net: m.rows.reduce((a, x) => a + x.net, 0) })) });
  });
}
