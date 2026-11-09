import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { handle } from "@/lib/http";
import { dataSource } from "@/lib/repositories";
import { activeSession, sessionItems } from "@/lib/stokan";
import { tally } from "@/lib/domain/stokan";

/**
 * Counting phone: the running session, this user's list (blind — the SOH qty is never sent), an index of every
 * article of the session for barcode matching, and the counts so far of the current phase.
 */
export async function GET() {
  return handle(async () => {
    const me = await getSession();
    if (!me) return NextResponse.json({ error: "Sesi berakhir, silakan login ulang" }, { status: 401 });
    const s = await activeSession();
    if (!s) return NextResponse.json({ session: null }, { headers: { "Cache-Control": "private, no-store" } });
    const [items, events] = await Promise.all([sessionItems(s.id), dataSource().getStokanLog(s.id)]);
    const phase = s.status === "recount" ? "recount" : "count";
    const t = tally(events);
    const mine = items.filter((x) => (phase === "recount" ? x.recount === me.nik : x.assignee === me.nik));
    const name = new Map(s.staff.map((x) => [x.nik, x.name]));
    const counts: Record<string, number> = {};
    for (const [a, c] of t.counts) {
      const v = phase === "recount" ? c.recount : c.count;
      if (v != null) counts[a] = v;
    }
    return NextResponse.json(
      {
        session: { id: s.id, label: s.label, status: s.status, sohDate: s.sohDate },
        phase,
        member: s.staff.some((x) => x.nik === me.nik),
        me: { nik: me.nik, name: me.name },
        mine: mine.map((x) => x.article),
        done: !!t.done.get(me.nik)?.has(phase),
        // [article, description, brand, barcodes, assignee name]
        index: items.map((x) => [x.article, x.description, x.brand, x.barcodes?.join(" ") ?? "", name.get(phase === "recount" ? (x.recount ?? x.assignee) : x.assignee) ?? ""]),
        counts,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
