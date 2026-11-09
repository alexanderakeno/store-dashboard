import { NextResponse } from "next/server";
import { getMonthSnapshot, getRules, resolveMonth } from "@/lib/services/dashboard";
import { getPriceList } from "@/lib/pricelist";
import { getAccPriceList } from "@/lib/accPrice";
import { getSamsungPromo } from "@/lib/samsungPromo";
import { getSoh } from "@/lib/soh";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Keep-warm ping (public, no data returned). Called every few minutes by the GitHub Actions
 * schedule (.github/workflows/keep-warm.yml) so a server instance stays up and the cached
 * Google Sheets reads (current month, SOH, price list, Samsung promo) are refreshed in the
 * background — the first visitor after a quiet period no longer waits for a cold start.
 * Everything goes through the normal caches, so a ping costs almost nothing.
 */
export async function GET() {
  const t0 = Date.now();
  const tasks: Array<Promise<unknown>> = [getRules(), getSoh(), getPriceList(), getAccPriceList(), getSamsungPromo()];
  const month = await resolveMonth(undefined).catch(() => null);
  if (month) tasks.push(getMonthSnapshot(month));
  const res = await Promise.allSettled(tasks);
  const failed = res.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ ok: failed === 0, failed, ms: Date.now() - t0 }, { headers: { "Cache-Control": "no-store" } });
}
