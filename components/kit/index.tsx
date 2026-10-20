import type { ReactNode } from "react";
import { Database } from "lucide-react";

/** Page heading block: optional eyebrow, title, description, right-side actions. */
export function PageIntro({ eyebrow, title, desc, actions }: { eyebrow?: ReactNode; title: ReactNode; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-black tracking-[.14em] text-blue-600 uppercase">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {desc && <p className="mt-1.5 text-sm text-slate-500 sm:text-base">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Section heading used between blocks ("Store Performance" + subtitle). */
export function SectionHead({ title, desc, right }: { title: ReactNode; desc?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-black text-slate-950 sm:text-xl">{title}</h2>
        {desc && <p className="mt-1 text-sm text-slate-500 sm:text-base">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

/** White rounded panel with optional header. */
export function Panel({ id, title, desc, right, children, className = "", pad = true }: { id?: string; title?: ReactNode; desc?: ReactNode; right?: ReactNode; children?: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section id={id} className={`sd-panel ${id ? "sd-anchor" : ""} ${pad ? "p-5 sm:p-6" : ""} ${className}`}>
      {(title || right) && (
        <div className={`flex flex-wrap items-start justify-between gap-3 ${children ? "mb-4" : ""}`}>
          <div className="min-w-0">
            {title && <h3 className="text-base font-black text-slate-950 sm:text-lg">{title}</h3>}
            {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Badge shown wherever a data source is not connected yet. */
export function NeedData({ label = "Need Data" }: { label?: string }) {
  return (
    <span className="sd-need" title="Sumber data belum dihubungkan">
      <Database className="size-3" aria-hidden />
      {label}
    </span>
  );
}

/** Empty / waiting-for-data block with the three colored blocks. */
export function EmptyBlock({ title = "Need Data", children, need = true }: { title?: ReactNode; children?: ReactNode; need?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
      <span className="sd-empty-blocks" aria-hidden><i /><i /><i /></span>
      <div className="flex items-center gap-2 text-sm font-bold text-slate-700">{title}{need && title !== "Need Data" && <NeedData />}</div>
      {children && <p className="max-w-md text-sm text-slate-500">{children}</p>}
    </div>
  );
}

export function Progress({ value, tick, color = "#3b82f6", label }: { value: number | null; tick?: number | null; color?: string; label: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="sd-progress" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value ?? 0)} aria-label={label}>
      <span style={{ width: `${v}%`, background: color }} />
      {tick != null && tick > 0 && tick < 100 && <i style={{ left: `${tick}%` }} title={`Time gone ${Math.round(tick)}%`} />}
    </div>
  );
}

/** Colour for an achievement % vs time gone. */
export function achColor(ach: number | null | undefined, timeGone?: number): string {
  if (ach == null) return "#94a3b8";
  if (ach >= 100) return "#10b981";
  if (timeGone != null ? ach >= timeGone : ach >= 85) return "#3b82f6";
  if (ach >= (timeGone ?? 85) * 0.85) return "#f59e0b";
  return "#f43f5e";
}

/** Small "▲ 12%" / "▼ 3%" coloured change label. */
export function Trend({ value, digits = 0, invert = false, className = "" }: { value: number | null | undefined; digits?: 0 | 1; invert?: boolean; className?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={`font-bold text-slate-400 ${className}`}>–</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  const s = Math.abs(value).toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return <span className={`font-bold ${good ? "text-emerald-600" : "text-rose-600"} ${className}`}>{up ? "▲" : "▼"} {s}%</span>;
}

/** Simple KPI tile (label, value, sub). */
export function Stat({ label, value, sub, tone, need }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "blue" | "green" | "amber" | "violet" | "rose"; need?: boolean }) {
  return (
    <div className="sd-block-card p-4 sm:p-5" data-tone={tone}>
      <p className="text-[11px] font-black tracking-[.08em] text-slate-500 uppercase">{label}</p>
      <div className="mt-2 text-xl font-black text-slate-950 sm:text-2xl">{need ? <NeedData /> : value}</div>
      {sub && <div className="mt-1 text-sm text-slate-500">{sub}</div>}
    </div>
  );
}
