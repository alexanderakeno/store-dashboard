"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Cookie that remembers how Weekly Performance cuts its weeks: "mon" = Monday–Sunday, absent = Sunday–Saturday (read in its page). */
const WEEK_START_COOKIE = "sd-week";

/** Two chips: Minggu–Sabtu (default) / Senin–Minggu. The choice is remembered on this device. */
export function WeekStartToggle({ value }: { value: 0 | 1 }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const pick = (v: 0 | 1) => {
    if (v === value) return;
    document.cookie = v ? `${WEEK_START_COOKIE}=mon; path=/; max-age=31536000; samesite=lax` : `${WEEK_START_COOKIE}=; path=/; max-age=0`;
    // week numbers mean different days in the other mode: drop the picked week and the compare mode
    const q = new URLSearchParams(sp.toString());
    q.delete("w");
    q.delete("lw");
    const s = q.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Awal week">
      <span className="text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">Week</span>
      {([[0, "Minggu–Sabtu"], [1, "Senin–Minggu"]] as const).map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => pick(v)}
          aria-pressed={v === value}
          className={`rounded-full border px-3 py-1 text-xs font-bold ${v === value ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
