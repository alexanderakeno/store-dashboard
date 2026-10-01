"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { dayShort, rp, rpc, pct } from "@/lib/format";

interface Point {
  date: string;
  sales: number;
  target: number;
}

/**
 * Daily sales columns + daily-target reference line. One y-axis (Rupiah).
 * Hover/focus a column for the tooltip; click to open that day in Sales.
 */
export function DailyChart({ data, month, selected }: { data: Point[]; month: string; selected?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!data.length) return <div className="muted small">Belum ada data.</div>;

  const H = 200;
  const pad = { l: 44, r: 8, t: 10, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const target = data[0]?.target ?? 0;
  const max = Math.max(target, ...data.map((d) => d.sales)) * 1.08 || 1;
  const step = niceStep(max / 4);
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const slot = iw / data.length;
  const bw = Math.min(24, Math.max(3, slot - 2));
  const y = (v: number) => pad.t + ih - (Math.max(0, v) / max) * ih;
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(iw / 38)));
  const h = hover != null ? data[hover] : null;

  return (
    <div className="chart" ref={wrap}>
      <div className="legend" style={{ marginBottom: 6 }}>
        <span><i className="swatch" style={{ background: "var(--accent)" }} />Sales harian</span>
        {target > 0 && <span><i className="swatch" style={{ background: "var(--ink-2)", height: 2, borderRadius: 1 }} />Target harian {rpc(target)}</span>}
      </div>
      <svg width={w} height={H} role="img" aria-label={`Sales harian ${month}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--muted)">{short(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * slot + (slot - bw) / 2;
          const top = y(d.sales);
          const hgt = Math.max(0, pad.t + ih - top);
          const r = Math.min(4, bw / 2, hgt);
          const met = target > 0 && d.sales >= target;
          const isSel = d.date === selected;
          return (
            <g key={d.date}>
              {hgt > 0 && (
                <path
                  d={`M${x},${pad.t + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${pad.t + ih} Z`}
                  fill="var(--accent)"
                  opacity={hover == null || hover === i ? (isSel ? 1 : met ? 1 : 0.72) : 0.35}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">{Number(d.date.slice(8))}</text>
              )}
              <rect
                x={pad.l + i * slot}
                y={pad.t}
                width={slot}
                height={ih}
                fill="transparent"
                tabIndex={0}
                aria-label={`${dayShort(d.date)}: ${rp(d.sales)}`}
                style={{ cursor: "pointer", outline: "none" }}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => router.push(`/sales?m=${month}&d=${d.date}`)}
                onKeyDown={(e) => e.key === "Enter" && router.push(`/sales?m=${month}&d=${d.date}`)}
              />
            </g>
          );
        })}
        <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--axis)" strokeWidth={1} />
        {target > 0 && <line x1={pad.l} x2={w - pad.r} y1={y(target)} y2={y(target)} stroke="var(--ink-2)" strokeWidth={2} strokeLinecap="round" opacity={0.75} pointerEvents="none" />}
      </svg>
      {h && hover != null && (
        <div className="tip" style={{ left: Math.min(w - 70, Math.max(70, pad.l + hover * slot + slot / 2)), top: y(h.sales) + 22 }}>
          <b>{dayShort(h.date)}</b>
          <div>{rp(h.sales)}</div>
          {target > 0 && <div className="muted">{pct((h.sales / target) * 100)} dari target harian</div>}
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function short(v: number): string {
  if (v >= 1e9) return `${+(v / 1e9).toFixed(1)}M`;
  if (v >= 1e6) return `${Math.round(v / 1e6)}jt`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}rb`;
  return String(v);
}
