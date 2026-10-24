import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { invalidate } from "@/lib/cache";
import type { PriceItem, PriceKind, QoalaTier } from "@/types/pricelist";
import { diffPrices, type PriceChange } from "@/lib/domain/priceHistory";

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
    const b = await jsonBody<{ kind?: unknown; date?: unknown; source?: unknown; items?: unknown; qoala?: unknown }>(req);
    const only = b.kind == null || b.kind === "" ? null : (String(b.kind) as PriceKind);
    if (only !== null && !KINDS.includes(only)) throw new BadRequest("Jenis price list harus apple atau android");
    const date = b.date == null || b.date === "" ? null : String(b.date);
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest("Tanggal harus YYYY-MM-DD");
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > MAX_ITEMS) throw new BadRequest("Price list kosong atau tidak valid");

    const items: PriceItem[] = b.items.map((r: Record<string, unknown>) => {
      const it: PriceItem = { kind: str(r?.kind, 10) as PriceKind, brand: str(r?.brand, 40), series: str(r?.series, 120), name: str(r?.name, 160), normal: money(r?.normal), promo: money(r?.promo), status: str(r?.status, 30).toUpperCase() || "ACTIVE" };
      if (!KINDS.includes(it.kind) || !it.name || Number.isNaN(it.normal) || Number.isNaN(it.promo)) throw new BadRequest(`Baris price list tidak valid: ${it.name || "(tanpa nama)"}`);
      // Apple: installment price + colours in brackets
      if (r?.credit != null) {
        const credit = money(r.credit);
        if (Number.isNaN(credit)) throw new BadRequest(`Harga cicilan tidak valid: ${it.name}`);
        it.credit = credit;
      }
      const note = str(r?.note, 400);
      if (note) it.note = note;
      // Android Excel: articles (colours) behind this row — stock is matched on them
      if (Array.isArray(r?.articles)) {
        const articles = (r.articles as unknown[]).slice(0, 60).map((a) => str(a, 40).toUpperCase()).filter(Boolean);
        if (articles.length) it.articles = articles;
      }
      return it;
    });
    const qoala: QoalaTier[] = (Array.isArray(b.qoala) ? b.qoala : []).slice(0, 30).map((q: Record<string, unknown>) => ({
      tier: str(q?.tier, 40),
      range: str(q?.range, 80),
      fees: Object.fromEntries(Object.entries((q?.fees as Record<string, unknown>) ?? {}).slice(0, 6).map(([k, v]) => [str(k, 4), money(v)]).filter(([, v]) => !Number.isNaN(v))),
    })).filter((q) => q.tier);

    if (only && items.some((x) => x.kind !== only)) throw new BadRequest(`Price list ${only === "apple" ? "Apple" : "Android"} berisi baris jenis lain — upload di bagian yang sesuai`);
    const kinds = [...new Set(items.map((x) => x.kind))];
    // what changed vs the stored list → price history (read before it is replaced)
    const prev = await dataSource().getPriceList().catch(() => null);
    const ts = new Date().toISOString();
    const changes: PriceChange[] = prev
      ? kinds.flatMap((k) => (prev.items.some((x) => x.kind === k) ? diffPrices(prev.items, items, { ts, kind: k, date: date ?? "", prevDate: prev.dates[k] ?? "", by: s.nik }) : []))
      : [];
    await dataSource().savePriceList({ kinds, date, source: str(b.source, 200), items, qoala }, s.nik);
    let historyNote = "";
    try {
      await dataSource().logPriceChanges(changes);
      invalidate("pricehistory");
    } catch (e) {
      historyNote = ` · riwayat harga gagal dicatat: ${(e as Error).message}`;
    }
    const moved = changes.filter((c) => c.change !== "import");
    const cnt = (t: PriceChange["change"]) => moved.filter((c) => c.change === t).length;
    const summary = changes.length ? ` · ${moved.length ? `${cnt("turun")} turun, ${cnt("naik")} naik, ${cnt("baru")} baru, ${cnt("hilang")} hilang` : "tidak ada perubahan harga"}` : "";
    await dataSource().audit({ nik: s.nik, action: "import.pricelist", detail: `${date ?? "-"}: ${kinds.join("+")} ${items.length} tipe, qoala ${qoala.length}` }).catch(() => {});
    invalidate("pricelist:");
    const label = kinds.map((k) => (k === "apple" ? "Apple" : "Android")).join(" & ");
    return NextResponse.json({ ok: true, message: `${label}: ${items.length} tipe${qoala.length ? ` · ${qoala.length} tier Qoala` : ""} tersimpan${summary}${historyNote}` });
  });
}
