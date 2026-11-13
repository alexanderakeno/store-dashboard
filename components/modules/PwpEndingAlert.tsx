import Link from "next/link";
import { appConfig } from "@/config/app";
import { todayIn } from "@/lib/domain/period";
import { endingSoon, pwpShortTitle } from "@/lib/domain/pwpPromo";
import { getPwpPromo } from "@/lib/pwpPromo";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const day = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

/** Overview: PWP promos that end within three weeks (nothing when none, or when the promo cannot be read). */
export async function PwpEndingAlert() {
  const promo = await getPwpPromo().catch(() => null);
  const list = endingSoon(promo, todayIn(appConfig().timeZone), 21);
  if (!list.length) return null;
  return (
    <section className="sd-panel p-4" aria-label="Promo PWP segera berakhir">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-slate-950">Promo PWP segera berakhir</p>
        <Link href="/promo-pwp" prefetch={false} className="shrink-0 text-xs font-semibold text-blue-600 hover:underline">Lihat semua ›</Link>
      </div>
      <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        {list.map((p) => (
          <li key={p.id}>
            <Link href={`/promo-pwp?b=${encodeURIComponent(p.brand)}`} prefetch={false} className="flex items-center gap-2 py-2 hover:text-blue-600">
              <span className="sd-badge violet shrink-0 !px-2 !text-[11px]">{p.brand}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-700 dark:text-slate-200">{pwpShortTitle(p.title, p.brand, true)}</span>
              <span className={`shrink-0 text-right text-[12px] font-bold ${p.daysLeft <= 7 ? "text-rose-600" : "text-amber-600"}`}>
                {day(p.end)}
                <span className="block text-[10px] font-semibold opacity-80">{p.daysLeft} hari lagi</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
