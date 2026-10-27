import type { CSSProperties, ReactNode } from "react";

export interface FitGridRow {
  key: string;
  cells: ReactNode[];
  sub?: ReactNode;
  /** id of a native popover opened by tapping the row */
  pop?: string;
  label?: string;
  className?: string;
}

/** Fixed-column grid that fits phones and desktops alike (name column takes the rest). */
export function Grid({ cols, colsM, head, rows, foot, hideM = [] }: { cols: string; colsM?: string; hideM?: number[]; head: ReactNode[]; rows: FitGridRow[]; foot?: ReactNode[] }) {
  // phones (< 640 px) may use narrower columns (`colsM`)
  const line = "grid items-center gap-x-2 px-3 sm:gap-x-3 grid-cols-[var(--gm)] sm:grid-cols-[var(--gd)]";
  const style = { "--gm": colsM ?? cols, "--gd": cols } as CSSProperties;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 text-[13px] sm:text-sm dark:border-slate-700">
      <div className={`${line} bg-slate-50 py-2 text-[10.5px] font-extrabold tracking-wide text-slate-500 uppercase dark:bg-slate-800/60`} style={style}>
        {head.map((h, i) => <span key={i} className={`${i ? "text-right" : ""} ${hideM.includes(i) ? "max-sm:hidden" : ""}`}>{h}</span>)}
      </div>
      {rows.map((r) => (
        <div key={r.key} className={`relative border-t border-slate-200 py-2 dark:border-slate-700 ${r.pop ? "hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800/50" : ""} ${r.className ?? ""}`}>
          {r.pop && <button type="button" popoverTarget={r.pop} className="absolute inset-0 z-10 cursor-pointer" aria-label={r.label ?? "Lihat detail"} />}
          <div className={`${line} tabular-nums`} style={style}>
            {r.cells.map((c, i) => <span key={i} className={`${i ? "text-right whitespace-nowrap" : "min-w-0 break-words"} ${hideM.includes(i) ? "max-sm:hidden" : ""}`}>{c}</span>)}
          </div>
          {r.sub && <div className={`mt-1 px-3 text-[11px] leading-snug text-slate-500 ${hideM.length ? "sm:hidden" : ""}`}>{r.sub}</div>}
        </div>
      ))}
      {!rows.length && <p className="border-t border-slate-200 px-3 py-5 text-center text-slate-500 dark:border-slate-700">Belum ada data.</p>}
      {foot && (
        <div className={`${line} border-t border-slate-200 bg-slate-50 py-2 font-black tabular-nums dark:border-slate-700 dark:bg-slate-800/60`} style={style}>
          {foot.map((c, i) => <span key={i} className={`${i ? "text-right whitespace-nowrap" : ""} ${hideM.includes(i) ? "max-sm:hidden" : ""}`}>{c}</span>)}
        </div>
      )}
    </div>
  );
}

