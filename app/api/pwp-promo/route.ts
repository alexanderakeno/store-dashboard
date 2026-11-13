import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { invalidate } from "@/lib/cache";
import { brandOf, mopCodes } from "@/lib/parsers/pwpPromo";
import type { PromoRange } from "@/types/samsungPromo";
import type { PwpDevice, PwpItem, PwpOffer, PwpProgram, PwpPromo } from "@/types/pwpPromo";

export const maxDuration = 60;

const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const list = <T>(v: unknown, max: number, what: string): T[] => {
  if (!Array.isArray(v)) return [];
  if (v.length > max) throw new BadRequest(`Terlalu banyak ${what} (${v.length})`);
  return v as T[];
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e10 ? Math.round(v) : 0);
const art = (v: unknown) => str(v, 40).toUpperCase();
const ranges = (v: unknown): PromoRange[] =>
  list<Record<string, unknown>>(v, 20, "periode")
    .map((r) => ({ from: str(r?.from, 10), to: str(r?.to, 10) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.from) && /^\d{4}-\d{2}-\d{2}$/.test(r.to));
/** One stored program is one sheet cell (max 50.000 characters). */
const CELL_MAX = 48000;

/** Admin: replace the stored PWP promo with the workbook parsed in the browser. */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<Record<string, unknown>>(req);
    const programs: PwpProgram[] = list<Record<string, unknown>>(b.programs, 100, "program").map((p, i) => {
      const devices: PwpDevice[] = list<Record<string, unknown>>(p?.devices, 400, "HP").map((d) => ({ article: art(d?.article), description: str(d?.description, 200), price: num(d?.price) })).filter((d) => d.article);
      const offers: PwpOffer[] = list<Record<string, unknown>>(p?.offers, 600, "aksesoris").map((o) => {
        const br = str(o?.br, 300);
        return {
          items: list<Record<string, unknown>>(o?.items, 10, "item").map((it): PwpItem => ({ articles: list<unknown>(it?.articles, 20, "artikel").map(art).filter(Boolean), description: str(it?.description, 200), price: num(it?.price) })).filter((it) => it.articles.length),
          cashback: num(o?.cashback),
          br,
          codes: mopCodes(br),
          devices: list<unknown>(o?.devices, 400, "HP").map((x) => num(x)).filter((x) => x < devices.length),
        };
      }).filter((o) => o.items.length && o.devices.length);
      const title = str(p?.title, 300);
      const prog: PwpProgram = { id: str(p?.id, 80) || `pwp-${i + 1}`, sheet: str(p?.sheet, 100), title, brand: str(p?.brand, 40) || brandOf([title]), br: str(p?.br, 300), period: str(p?.period, 200), ranges: ranges(p?.ranges), devices, offers };
      if (JSON.stringify(prog).length > CELL_MAX) throw new BadRequest(`Sheet ${prog.sheet} terlalu besar untuk disimpan`);
      return prog;
    }).filter((p) => p.devices.length && p.offers.length);
    if (!programs.length) throw new BadRequest("File tidak berisi tabel promo PWP (header Digiplus Article | Description | Current Price …)");
    const promo: Omit<PwpPromo, "updatedAt" | "updatedBy"> = {
      title: str(b.title, 200),
      source: str(b.source, 200),
      programs,
      warnings: list<unknown>(b.warnings, 100, "peringatan").map((w) => str(w, 500)),
    };
    await dataSource().savePwpPromo(promo, s.nik);
    invalidate("pwppromo");
    const offers = programs.reduce((a, p) => a + p.offers.length, 0);
    await dataSource().audit({ nik: s.nik, action: "import.pwppromo", detail: `${promo.source}: ${programs.length} promo, ${offers} aksesoris` }).catch(() => {});
    return NextResponse.json({ ok: true, message: `${programs.length} promo PWP · ${offers} pilihan aksesoris tersimpan` });
  });
}
