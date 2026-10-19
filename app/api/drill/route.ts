import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { BadRequest, handle } from "@/lib/http";
import { linesIn } from "@/lib/domain/extra";
import { articleSales, drillLines, type DrillGroup } from "@/lib/domain/drill";
import { getMonthSnapshot, resolveAsOf } from "@/lib/services/dashboard";

const GROUPS: DrillGroup[] = ["apple", "android", "vas"];

/** Overview popup drill-down (articles → sales person), loaded only when a product popup is opened. */
export async function GET(req: Request) {
  return handle(async () => {
    if (!(await getSession())) return NextResponse.json({ error: "Sesi berakhir, silakan login ulang" }, { status: 401 });
    const q = new URL(req.url).searchParams;
    const month = q.get("m") ?? "";
    const group = q.get("g") as DrillGroup;
    const key = (q.get("k") ?? "").slice(0, 60);
    if (!/^\d{4}-\d{2}$/.test(month) || !GROUPS.includes(group) || !key) throw new BadRequest("Parameter rincian tidak valid");
    const snap = await getMonthSnapshot(month);
    const asOf = resolveAsOf(snap, q.get("d"));
    const items = articleSales(drillLines(linesIn(snap, `${month}-01`, asOf), group, key), group === "vas");
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, max-age=60" } });
  });
}
