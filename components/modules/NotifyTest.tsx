"use client";
import { useState } from "react";
import { postJson } from "@/components/modules/postJson";

/** Settings: sends a Telegram test message and shows the result. */
export function NotifyTest({ ready }: { ready: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="sd-btn"
        disabled={busy || !ready}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await postJson("/api/notify-test", {});
            const b = await r.json().catch(() => ({}));
            setMsg(r.ok ? { ok: true, text: b.message ?? "Terkirim." } : { ok: false, text: b.error ?? `Gagal (HTTP ${r.status})` });
          } catch (e) {
            setMsg({ ok: false, text: (e as Error).message });
          }
          setBusy(false);
        }}
      >
        {busy ? "Mengirim…" : "Kirim pesan tes"}
      </button>
      {msg && <span className={`text-sm font-semibold ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</span>}
    </div>
  );
}
