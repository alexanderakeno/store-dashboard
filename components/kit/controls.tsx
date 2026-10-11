"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Image as ImageIcon, MessageCircle } from "lucide-react";

function useParamNav() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const go = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? q.set(k, v) : q.delete(k));
    const s = q.toString();
    start(() => router.push(s ? `${path}?${s}` : path, { scroll: false }));
  };
  return { go, pending, sp };
}

/** <select> bound to a URL search param. */
export function ParamSelect({ param, value, options, label, reset = [], className = "" }: { param: string; value: string; options: Array<{ value: string; label: string; disabled?: boolean }>; label?: string; reset?: string[]; className?: string }) {
  const { go, pending } = useParamNav();
  return (
    <label className={`block min-w-0 ${className}`}>
      {label && <span className="sd-label">{label}</span>}
      <select
        className="sd-select"
        value={value}
        aria-busy={pending}
        onChange={(e) => go({ [param]: e.target.value || null, ...Object.fromEntries(reset.map((r) => [r, null])) })}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/** <input type=date> bound to a URL search param. */
export function ParamDate({ param, value, min, max, label, className = "" }: { param: string; value: string; min?: string; max?: string; label?: string; className?: string }) {
  const { go, pending } = useParamNav();
  return (
    <label className={`block min-w-0 ${className}`}>
      {label && <span className="sd-label">{label}</span>}
      <input className="sd-input" type="date" value={value} min={min} max={max} aria-busy={pending} onChange={(e) => go({ [param]: e.target.value || null })} />
    </label>
  );
}

/** Copy text to clipboard (WhatsApp share). */
export function CopyButton({ text, label = "Salin", className = "sd-btn", icon = "copy" }: { text: string; label?: string; className?: string; icon?: "copy" | "wa" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? <Check className="size-4" /> : icon === "wa" ? <MessageCircle className="size-4" /> : <Copy className="size-4" />}
      {done ? "Tersalin" : label}
    </button>
  );
}

/** Opens WhatsApp with the text (falls back to copy on desktop browsers without WA). */
export function WhatsAppButton({ text, label = "Share WhatsApp", className = "sd-btn success" }: { text: string; label?: string; className?: string }) {
  return (
    <a className={className} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
      <MessageCircle className="size-4" />
      {label}
    </a>
  );
}

/** "Picture Screenshot" — opens the print dialog (save as PDF / image). */
export function PrintButton({ label = "Picture Screenshot", className = "sd-btn" }: { label?: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <ImageIcon className="size-4" />
      {label}
    </button>
  );
}

export interface SeriesPoint {
  label: string;
  value: number;
  tip?: string;
}

/** Smooth line chart (monotone curve) like the reference "Sales Trend". */
export function LineChart({ data, height = 260, color = "#0f172a", format = shortRp, area = false }: { data: SeriesPoint[]; height?: number; color?: string; format?: (n: number) => string; area?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!data.length) return <div className="py-10 text-center text-sm text-slate-500">Belum ada data.</div>;
  const pad = { l: 52, r: 10, t: 12, b: 26 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const maxRaw = Math.max(...data.map((d) => d.value), 1);
  const step = niceStep(maxRaw / 4);
  const max = Math.ceil(maxRaw / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const x = (i: number) => pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (Math.max(0, v) / max) * ih;
  const pts = data.map((d, i) => [x(i), y(d.value)] as const);
  const path = monotone(pts);
  const h = hover != null ? data[hover] : null;
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(iw / 44)));
  return (
    <div className="sd-chart" ref={wrap}>
      <svg width={w} height={height} role="img" aria-label="Grafik" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l - 4} x2={pad.l} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-slate-400" />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} className="fill-slate-500">{format(t)}</text>
          </g>
        ))}
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={pad.t + ih} stroke="currentColor" className="text-slate-400" />
        <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="currentColor" className="text-slate-400" />
        {area && <path d={`${path} L${pts[pts.length - 1][0]},${pad.t + ih} L${pts[0][0]},${pad.t + ih} Z`} fill={color} opacity={0.08} />}
        <path d={path} fill="none" stroke={color} strokeWidth={2} className="dark:!stroke-slate-100" />
        {data.map((d, i) => (
          <g key={i}>
            {i % labelEvery === 0 && (
              <text x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} className="fill-slate-500">{d.label}</text>
            )}
            <rect x={x(i) - iw / data.length / 2} y={pad.t} width={Math.max(8, iw / data.length)} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
        {hover != null && <circle cx={pts[hover][0]} cy={pts[hover][1]} r={4} fill={color} className="dark:!fill-slate-100" />}
      </svg>
      {h && hover != null && (
        <div className="sd-tip" style={{ left: Math.min(w - 80, Math.max(80, pts[hover][0])), top: pts[hover][1] - 10 }}>
          <b>{h.tip ?? h.label}</b>
          <div>{format === shortRp ? fullRp(h.value) : format(h.value)}</div>
        </div>
      )}
    </div>
  );
}

function monotone(pts: ReadonlyArray<readonly [number, number]>): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function shortRp(v: number): string {
  if (v >= 1e9) return `${+(v / 1e9).toFixed(1)}M`;
  if (v >= 1e6) return `${Math.round(v / 1e6)}jt`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}rb`;
  return `${Math.round(v)}`;
}

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
function fullRp(v: number) {
  return `Rp ${nf.format(Math.round(v))}`;
}
