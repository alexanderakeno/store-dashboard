import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { homeView } from "@/lib/domain/views";
import { handle } from "@/lib/http";
import { getMonthSnapshot, resolveAsOf, resolveMonth } from "@/lib/services/dashboard";

/** Read-only JSON of the Home view (for integrations / debugging). */
export async function GET(req: Request) {
  return handle(async () => {
    if (!(await getSession())) return NextResponse.json({ error: "Sesi berakhir" }, { status: 401 });
    const url = new URL(req.url);
    const month = await resolveMonth(url.searchParams.get("m"));
    if (!month) return NextResponse.json({ error: "Belum ada bulan terdaftar" }, { status: 404 });
    const snap = await getMonthSnapshot(month);
    const asOf = resolveAsOf(snap, url.searchParams.get("d"));
    const { series, ...home } = homeView(snap, asOf);
    return NextResponse.json({ month, asOf, lastUpdated: new Date(snap.loadedAt).toISOString(), home, series, issues: snap.issues });
  });
}
