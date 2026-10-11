"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Row = { key: string; data: Record<string, string | number | boolean> };

export async function putRecords(kind: string, date: string, rows: Row[]) {
  const r = await fetch("/api/records", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, date, rows }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Gagal (${r.status})`);
}

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<void>, okText = "Tersimpan") => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run };
}

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  return m ? <span className={`text-sm font-semibold ${m.ok ? "text-emerald-600" : "text-rose-600"}`} role="status">{m.text}</span> : null;
}

/** BNPL & Trade-In: qty + amount per provider for one date. */
export function BnplForm({ providers, date, initial, min, max }: { providers: string[]; date: string; initial: Record<string, Record<string, { qty: number; amount: number }>>; min: string; max: string }) {
  const [d, setD] = useState(date);
  const blank = (day: string) => Object.fromEntries(providers.map((p) => [p, { qty: String(initial[day]?.[p]?.qty || ""), amount: String(initial[day]?.[p]?.amount || "") }]));
  const [vals, setVals] = useState<Record<string, { qty: string; amount: string }>>(() => blank(date));
  const { busy, msg, run } = useSave();
  const set = (p: string, k: "qty" | "amount", v: string) => setVals((x) => ({ ...x, [p]: { ...x[p], [k]: v } }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => putRecords("bnpl", d, providers.filter((p) => Number(vals[p].qty) || Number(vals[p].amount)).map((p) => ({ key: p, data: { qty: Number(vals[p].qty) || 0, amount: Number(vals[p].amount) || 0 } }))));
      }}
    >
      <label className="block w-48"><span className="sd-label">Tanggal</span><input className="sd-input" type="date" value={d} min={min} max={max} onChange={(e) => { setD(e.target.value); setVals(blank(e.target.value)); }} /></label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {providers.map((p) => (
          <div key={p} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 text-sm font-black">{p}</p>
            <div className="grid grid-cols-[4.5rem_1fr] gap-2">
              <input className="sd-input" inputMode="numeric" placeholder="Qty" value={vals[p].qty} onChange={(e) => set(p, "qty", e.target.value.replace(/\D/g, ""))} aria-label={`${p} qty`} />
              <input className="sd-input" inputMode="numeric" placeholder="Amount (Rp)" value={vals[p].amount} onChange={(e) => set(p, "amount", e.target.value.replace(/\D/g, ""))} aria-label={`${p} amount`} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3"><button className="sd-btn dark" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button><Msg m={msg} /></div>
    </form>
  );
}

/** One free-text note per key (feedback per staff per day, reason per staff per week). */
export function NoteEditor({ kind, date, keyName, initial, others, placeholder, label }: { kind: string; date: string; keyName: string; initial: string; others: Row[]; placeholder: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial);
  const { busy, msg, run } = useSave();
  if (!open)
    return (
      <div className="flex flex-wrap items-center gap-2">
        {initial && <span className="max-w-md text-sm text-slate-600">“{initial}”</span>}
        <button type="button" className="sd-btn !min-h-8 text-xs" onClick={() => setOpen(true)}>{initial ? "Ubah" : label}</button>
        <Msg m={msg} />
      </div>
    );
  return (
    <form
      className="w-full space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const rest = others.filter((o) => o.key !== keyName);
        run(async () => {
          await putRecords(kind, date, [...rest, ...(text.trim() ? [{ key: keyName, data: { text: text.trim() } }] : [])]);
          setOpen(false);
        });
      }}
    >
      <textarea className="sd-input min-h-20 !font-[inherit] !text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={2000} autoFocus />
      <div className="flex items-center gap-2">
        <button className="sd-btn primary !min-h-8 text-xs" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
        <button type="button" className="sd-btn !min-h-8 text-xs" onClick={() => setOpen(false)}>Batal</button>
        <Msg m={msg} />
      </div>
    </form>
  );
}

/** Checklist ticks for one date. */
export function ChecklistForm({ kind, date, items, initial, canEdit }: { kind: string; date: string; items: string[]; initial: string[]; canEdit: boolean }) {
  const [done, setDone] = useState<Set<string>>(() => new Set(initial));
  const { busy, msg, run } = useSave();
  const toggle = (k: string) => setDone((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => putRecords(kind, date, [...done].map((k) => ({ key: k, data: { done: true } })))); }}>
      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t}>
            <label className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${done.has(t) ? "border-emerald-300 bg-emerald-50" : "border-slate-200 dark:border-slate-700"}`}>
              <input type="checkbox" className="size-4" checked={done.has(t)} disabled={!canEdit} onChange={() => toggle(t)} />
              <span className={done.has(t) ? "line-through opacity-70" : ""}>{t}</span>
            </label>
          </li>
        ))}
      </ul>
      {canEdit && <div className="flex items-center gap-3"><button className="sd-btn dark" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Checklist"}</button><Msg m={msg} /></div>}
    </form>
  );
}
