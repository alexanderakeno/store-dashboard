import type { ReactNode } from "react";

export interface MobileCol {
  label: ReactNode;
  /** Fixed width of a value column (CSS length, e.g. "4.5rem"); the first column takes the rest. */
  w?: string;
}
export interface MobileRow {
  key: string;
  cells: ReactNode[];
  /** Small full-width line under the row (secondary numbers). */
  sub?: ReactNode;
  className?: string;
}

/**
 * Phone-only compact table (`sm:hidden`): a real column grid that always fits 360–430 px screens —
 * name column first, short right-aligned value columns, optional detail line per row. Pages show it
 * next to their desktop table (marked `max-sm:hidden`), so phones never get the long stacked cards.
 */
export function MobileGrid({ cols, rows, foot, empty = "Tidak ada data.", className = "", minFirst = "2.6rem" }: { cols: MobileCol[]; rows: MobileRow[]; foot?: ReactNode[]; empty?: ReactNode; className?: string; minFirst?: string }) {
  // the name column never collapses to a sliver: value columns give way first (they wrap as a block)
  const template = { gridTemplateColumns: `minmax(${minFirst},1fr) ${cols.slice(1).map((c) => c.w ?? "auto").join(" ")}` };
  const line = "grid items-center gap-x-2 px-3";
  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 text-[13px] sm:hidden dark:border-slate-700 ${className}`}>
      <div className={`${line} bg-slate-50 py-2 text-[10.5px] font-extrabold tracking-wide text-slate-500 uppercase dark:bg-slate-800/60`} style={template}>
        {cols.map((c, i) => (
          <span key={i} className={i ? "text-right" : ""}>{c.label}</span>
        ))}
      </div>
      {rows.length ? (
        rows.map((r) => (
          <div key={r.key} className={`border-t border-slate-200 py-2 dark:border-slate-700 ${r.className ?? ""}`}>
            <div className={`${line} tabular-nums`} style={template}>
              {r.cells.map((c, i) => (
                <span key={i} className={i ? "text-right whitespace-nowrap" : "min-w-0 break-words"}>{c}</span>
              ))}
            </div>
            {r.sub && <div className="mt-0.5 px-3 text-[11px] leading-snug text-slate-500">{r.sub}</div>}
          </div>
        ))
      ) : (
        <p className="border-t border-slate-200 px-3 py-5 text-center text-slate-500 dark:border-slate-700">{empty}</p>
      )}
      {foot && (
        <div className={`${line} border-t border-slate-200 bg-slate-50 py-2 font-black tabular-nums dark:border-slate-700 dark:bg-slate-800/60`} style={template}>
          {foot.map((c, i) => (
            <span key={i} className={i ? "text-right" : ""}>{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}
