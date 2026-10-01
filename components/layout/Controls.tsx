"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

/** Month + "as of" date selector; state lives in the URL (?m=YYYY-MM&d=YYYY-MM-DD). */
export function PeriodPicker({ months, month, asOf, min, max }: { months: Array<{ month: string; label: string }>; month: string; asOf: string; min: string; max: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const go = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? q.set(k, v) : q.delete(k));
    start(() => router.push(`${path}?${q.toString()}`));
  };
  return (
    <div className="picker" aria-busy={pending}>
      <label className="sr-only" htmlFor="pp-month">Bulan</label>
      <select id="pp-month" value={month} onChange={(e) => go({ m: e.target.value, d: null })}>
        {months.map((m) => (
          <option key={m.month} value={m.month}>{m.label}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="pp-date">Data s/d tanggal</label>
      <input id="pp-date" type="date" value={asOf} min={min} max={max} onChange={(e) => go({ d: e.target.value || null })} title="Data sampai tanggal" />
      {pending && <span className="small muted">memuat…</span>}
    </div>
  );
}

export function RefreshButton({ month }: { month: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [msg, setMsg] = useState("");
  const run = async () => {
    setState("busy");
    setMsg("");
    try {
      const r = await fetch("/api/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Gagal refresh");
      setState("idle");
      router.refresh();
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  };
  return (
    <span className="row" style={{ gap: 6 }}>
      <button className="btn sm" onClick={run} disabled={state === "busy"} title="Baca ulang data dari Google Sheet">
        {state === "busy" ? "Memuat…" : "↻ Refresh"}
      </button>
      {state === "error" && <span className="small neg" role="alert">{msg}</span>}
    </span>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn sm"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      Keluar
    </button>
  );
}

export function CopyButton({ text, label = "Salin" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn sm"
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
      {done ? "✓ Tersalin" : label}
    </button>
  );
}
