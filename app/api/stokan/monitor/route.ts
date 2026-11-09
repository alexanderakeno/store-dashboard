import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { BadRequest, handle } from "@/lib/http";
import { monitor } from "@/lib/stokan";
import { finalOf, isChecked, tally } from "@/lib/domain/stokan";

/** Admin monitor of a session (polled while counting). `?rows=1` adds every article for the Excel export. */
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const q = new URL(req.url).searchParams;
    const id = q.get("id") ?? "";
    if (!id) throw new BadRequest("id wajib");
    const m = await monitor(id);
    const body: Record<string, unknown> = { session: m.session, view: m.view };
    if (q.get("rows") === "1") {
      const t = tally(m.events);
      const name = new Map(m.session.staff.map((s) => [s.nik, s.name]));
      body.rows = m.items.map((x) => {
        const c = t.counts.get(x.article);
        const checked = x.final != null || isChecked(t, x);
        const final = checked ? (x.final ?? finalOf(t, x.article)) : null;
        return { article: x.article, description: x.description, brand: x.brand, category: x.category, reason: x.reason, expected: x.expected, count: c?.count ?? null, recount: c?.recount ?? null, final, diff: final == null ? null : final - x.expected, price: x.price, value: final == null ? null : (final - x.expected) * x.price, staff: name.get(x.assignee) ?? x.assignee, recountBy: x.recount ? (name.get(x.recount) ?? x.recount) : "" };
      });
    }
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  });
}
