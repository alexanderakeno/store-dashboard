import type { ReactNode } from "react";
import { pct, tone } from "@/lib/format";
import type { Group } from "@/types/domain";

export function Card({ title, aside, children, className = "" }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || aside) && (
        <header>
          {typeof title === "string" ? <h2>{title}</h2> : title}
          {aside && <div className="small muted">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Tile({ label, value, sub, title }: { label: string; value: ReactNode; sub?: ReactNode; title?: string }) {
  return (
    <div className="card tile" title={title}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** Achievement meter: fill = achievement (capped 100%), optional tick for the time-gone %. */
export function Meter({ value, tick, label }: { value: number | null; tick?: number | null; label: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={`meter ${tone(value)}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value ?? 0)} aria-label={label}>
      <span style={{ width: `${v}%` }} />
      {tick != null && tick > 0 && tick < 100 && <i className="tick" style={{ left: `${tick}%` }} title={`Waktu berjalan ${pct(tick, 0)}`} />}
    </div>
  );
}

const ICON = { good: "▲", warn: "●", bad: "▼", none: "" } as const;

/** Achievement badge: color + icon + number, never color alone. */
export function Ach({ value, digits = 1 }: { value: number | null | undefined; digits?: 0 | 1 }) {
  const t = tone(value);
  return (
    <span className={`badge ${t === "none" ? "" : t}`}>
      {ICON[t] && <span aria-hidden>{ICON[t]}</span>}
      {pct(value, digits)}
    </span>
  );
}

export function Delta({ value, format }: { value: number; format: (n: number) => string }) {
  return <span className={value >= 0 ? "pos" : "neg"}>{value >= 0 ? "+" : ""}{format(value)}</span>;
}

const GROUP_VAR: Record<Group, string> = { Apple: "--g-apple", Android: "--g-android", ACC: "--g-acc", VAS: "--g-vas" };
export function GroupName({ group }: { group: Group }) {
  return (
    <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
      <i className="swatch" style={{ background: `var(${GROUP_VAR[group]})` }} aria-hidden />
      {group}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <h2>{title}</h2>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  return <div className={`alert ${kind === "info" ? "" : kind}`} role={kind === "error" ? "alert" : undefined}>{children}</div>;
}
