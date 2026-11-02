import { NextResponse } from "next/server";
import { appConfig } from "@/config/app";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, assertSameOrigin, handle, jsonBody } from "@/lib/http";
import { invalidate } from "@/lib/cache";
import { buildReport } from "@/lib/domain/report";
import { prevMonth, sameMonthLastYear, todayIn } from "@/lib/domain/period";
import { records } from "@/lib/records";
import { dataSource } from "@/lib/repositories";
import { getMonthLines, getMonthSnapshot, getMonths, resolveAsOf, resolveMonth } from "@/lib/services/dashboard";
import type { SalesLine } from "@/types/domain";

export const maxDuration = 60;

const MAX_MANUAL = 30_000;

/** Admin: data for the Weekly / Closing PPT of month `m` + the inputs typed earlier for that month. */
export async function GET(req: Request) {
  return handle(async () => {
    const s = await requireAdmin();
    const month = await resolveMonth(new URL(req.url).searchParams.get("m"));
    if (!month) throw new BadRequest("Belum ada bulan terdaftar");
    const cfg = appConfig();
    const months = await getMonths();
    const snap = await getMonthSnapshot(month);
    const asOf = resolveAsOf(snap);
    const pm = prevMonth(month);
    const year = month.slice(0, 4);
    const prevYear = String(Number(year) - 1);
    const ytdKeys: string[] = [];
    for (let n = 1; n <= Number(month.slice(5, 7)); n++) {
      const mm = String(n).padStart(2, "0");
      ytdKeys.push(`${year}-${mm}`, `${prevYear}-${mm}`);
    }
    const [prevSnap, prevLines, ly, ytdPairs, bnpl, saved] = await Promise.all([
      months.some((m) => m.month === pm) ? getMonthSnapshot(pm).catch(() => null) : Promise.resolve(null),
      getMonthLines(pm, months).catch(() => null),
      getMonthLines(sameMonthLastYear(month), months).catch(() => null),
      Promise.all(ytdKeys.map(async (k) => [k, k === month ? snap.lines : ((await getMonthLines(k, months).catch(() => null))?.lines ?? null)] as const)),
      records("bnpl", month),
      dataSource().listRecords("report", `${month}-01`).catch(() => []),
    ]);
    const ytd = new Map<string, SalesLine[]>();
    for (const [k, v] of ytdPairs) if (v) ytd.set(k, v);
    const data = buildReport({
      storeCode: cfg.storeCode,
      storeName: cfg.storeName,
      month,
      asOf,
      today: todayIn(cfg.timeZone),
      lines: snap.lines,
      target: snap.target,
      traffic: snap.traffic,
      prev: prevSnap ? { lines: prevSnap.lines, traffic: prevSnap.traffic } : prevLines ? { lines: prevLines.lines, traffic: [] } : null,
      ly: ly?.lines ?? null,
      ytd,
      bnpl: bnpl.map((r) => ({ key: r.key, data: r.data })),
    });
    let manual: unknown = null;
    const rec = saved.find((r) => r.key === "manual");
    if (rec && typeof rec.data.json === "string") {
      try {
        manual = JSON.parse(rec.data.json);
      } catch {
        manual = null;
      }
    }
    return NextResponse.json({ data, manual, author: `${s.name}${s.nik ? ` - ${s.nik}` : ""}`, months: months.filter((m) => m.active).map((m) => m.month) });
  });
}

/** Admin: remember what was typed in the pop-up for month `m` (one record per month). */
export async function PUT(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const s = await requireAdmin();
    const b = await jsonBody<{ month?: string; manual?: unknown }>(req);
    const month = String(b.month ?? "");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequest("Bulan harus YYYY-MM");
    if (!b.manual || typeof b.manual !== "object") throw new BadRequest("Data tidak valid");
    const json = JSON.stringify(b.manual);
    if (json.length > MAX_MANUAL) throw new BadRequest("Isian terlalu panjang");
    await dataSource().saveRecords("report", `${month}-01`, [{ key: "manual", data: { json } }], s.nik);
    invalidate("records:");
    return NextResponse.json({ ok: true });
  });
}
