import Link from "next/link";
import { appConfig } from "@/config/app";
import { todayIn } from "@/lib/domain/period";
import { endingSoon } from "@/lib/domain/pwpPromo";
import { getPwpPromo } from "@/lib/pwpPromo";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const day = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

/** Overview: PWP promos that end within three weeks (nothing when none, or when the promo cannot be read). */
export async function PwpEndingAlert() {
  const promo = await getPwpPromo().catch(() => null);
  const list = endingSoon(promo, todayIn(appConfig().timeZone), 21);
  if (!list.length) return null;
  return (
    <section className="sd-panel flex flex-wrap items-center gap-x-3 gap-y-2 p-4" aria-label="Promo PWP segera berakhir">
      <p className="text-sm font-black text-slate-950">Promo PWP segera berakhir</p>
      <ul className="flex flex-1 flex-wrap gap-1.5">
        {list.map((p) => (
          <li key={p.id}>
            <Link href={`/promo-pwp?b=${encodeURIComponent(p.brand)}`} prefetch={false} className={`sd-badge ${p.daysLeft <= 7 ? "red" : "amber"} hover:underline`}>
              {p.title.replace(/^Promo PWP\s*/i, "")} · s/d {day(p.end)} ({p.daysLeft} hari)
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/promo-pwp" prefetch={false} className="text-xs font-semibold text-blue-600 hover:underline">Lihat semua ›</Link>
    </section>
  );
}
