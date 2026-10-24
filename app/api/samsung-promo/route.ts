import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { invalidate } from "@/lib/cache";
import { kindOfSheet } from "@/lib/parsers/samsungPromo";
import type { PromoArticle, PromoPair, PromoProgram, PromoRange, PromoSheet, SamsungPromo } from "@/types/samsungPromo";

export const maxDuration = 60;

const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const list = <T>(v: unknown, max: number, what: string): T[] => {
  if (!Array.isArray(v)) return [];
  if (v.length > max) throw new BadRequest(`Terlalu banyak ${what} (${v.length})`);
  return v as T[];
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e10 ? Math.round(v) : 0);
const ranges = (v: unknown): PromoRange[] =>
  list<Record<string, unknown>>(v, 20, "periode")
    .map((r) => ({ from: str(r?.from, 10), to: str(r?.to, 10) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.from) && /^\d{4}-\d{2}-\d{2}$/.test(r.to));
const codes = (v: unknown) => list<unknown>(v, 40, "kode").map((c) => str(c, 40).toUpperCase()).filter(Boolean);

/** Admin: replace the stored Samsung promo with the workbook parsed in the browser. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<Record<string, unknown>>(req);
    const programs: PromoProgram[] = list<Record<string, unknown>>(b.programs, 300, "program").map((p, i) => ({
      no: num(p?.no) || i + 1,
      type: str(p?.type, 120),
      name: str(p?.name, 400),
      mechanism: str(p?.mechanism, 3000),
      period: str(p?.period, 300),
      ranges: ranges(p?.ranges),
      combine: str(p?.combine, 3000),
      stores: codes(p?.stores),
      codes: codes(p?.codes),
    }));
    const articles: PromoArticle[] = list<Record<string, unknown>>(b.articles, 5000, "artikel promo").map((a) => {
      const sheet = str(a?.sheet, 100);
      return {
        sheet,
        kind: kindOfSheet(sheet),
        article: str(a?.article, 40).toUpperCase(),
        description: str(a?.description, 200),
        value: num(a?.value),
        code: str(a?.code, 40).toUpperCase(),
        normal: a?.normal == null ? null : num(a.normal) || null,
        ranges: ranges(a?.ranges),
        stores: codes(a?.stores),
      };
    }).filter((a) => a.article);
    const pairs: PromoPair[] = list<Record<string, unknown>>(b.pairs, 20000, "pasangan PWP").map((p) => ({ sheet: str(p?.sheet, 100), article: str(p?.article, 40).toUpperCase(), description: str(p?.description, 200) })).filter((p) => p.article);
    const sheets: PromoSheet[] = list<Record<string, unknown>>(b.sheets, 200, "sheet").map((x) => {
      const name = str(x?.name, 100);
      return { name, kind: kindOfSheet(name), program: num(x?.program) || null, ranges: ranges(x?.ranges), notes: list<unknown>(x?.notes, 400, "baris ketentuan").map((n) => str(n, 1500)).filter(Boolean) };
    });
    if (!programs.length && !articles.length) throw new BadRequest("File tidak berisi promo Samsung (sheet List Promo / tabel artikel tidak ditemukan)");
    const promo: Omit<SamsungPromo, "updatedAt" | "updatedBy"> = {
      title: str(b.title, 200),
      programs,
      articles,
      pairs,
      sheets,
      warnings: list<unknown>(b.warnings, 100, "peringatan").map((w) => str(w, 500)),
      source: str(b.source, 200),
    };
    await dataSource().saveSamsungPromo(promo, s.nik);
    invalidate("samsungpromo");
    await dataSource().audit({ nik: s.nik, action: "import.samsungpromo", detail: `${promo.source}: ${programs.length} program, ${articles.length} artikel, ${pairs.length} pasangan PWP` }).catch(() => {});
    return NextResponse.json({ ok: true, message: `${programs.length} program · ${articles.length} artikel promo · ${pairs.length} pasangan PWP tersimpan` });
  });
}
