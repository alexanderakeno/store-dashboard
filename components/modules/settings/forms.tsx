"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = { kind: "ok" | "error"; text: string } | null;

async function send(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Gagal (${r.status})`);
  return j;
}

function StatusLine({ s }: { s: Status }) {
  if (!s) return null;
  return <div className={`alert small ${s.kind === "ok" ? "ok" : "error"}`} role="status">{s.text}</div>;
}

export function MonthForm({ defaultMonth, fixture }: { defaultMonth: string; fixture: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>, checkOnly: boolean) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget.form ?? e.currentTarget);
    setBusy(true);
    setStatus(null);
    try {
      const j = await send("/api/months", "POST", { month: fd.get("month"), url: fd.get("url"), label: fd.get("label") || undefined, checkOnly });
      const c = j.check as { title: string; hasSales: boolean; hasTarget: boolean };
      const tabs = `Control MR &SP ${c.hasSales ? "✓" : "✕"} · Target Store ${c.hasTarget ? "✓" : "✕"}`;
      setStatus({ kind: c.hasSales ? "ok" : "error", text: `${checkOnly ? "Terhubung" : "Tersimpan"}: "${c.title}" — ${tabs}` });
      if (!checkOnly) router.refresh();
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="stack" onSubmit={(e) => submit(e, false)}>
      <div className="grid c2">
        <label className="field">Bulan<input name="month" type="month" defaultValue={defaultMonth} required /></label>
        <label className="field">Label (opsional)<input name="label" type="text" maxLength={100} /></label>
      </div>
      <label className="field">
        Link Google Sheet bulan ini
        <input name="url" type="url" placeholder={fixture ? "(mode fixture — boleh dikosongkan)" : "https://docs.google.com/spreadsheets/d/…"} required={!fixture} />
      </label>
      <div className="row">
        <button className="btn" type="button" disabled={busy} onClick={(e) => submit(e as unknown as React.FormEvent<HTMLFormElement>, true)}>Tes koneksi</button>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </div>
      <StatusLine s={status} />
    </form>
  );
}

export function TrafficForm({ month, days, initial }: { month: string; days: string[]; initial: Record<string, number> }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(days.map((d) => [d, initial[d] ? String(initial[d]) : ""])));
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await send("/api/traffic", "PUT", { month, entries: days.map((d) => ({ date: d, traffic: Number(vals[d] || 0) })) });
      setStatus({ kind: "ok", text: "Traffic tersimpan" });
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="stack" onSubmit={save}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }}>
        {days.map((d) => (
          <label key={d} className="field">
            {Number(d.slice(8))}
            <input type="number" inputMode="numeric" min={0} step={1} value={vals[d]} onChange={(e) => setVals((v) => ({ ...v, [d]: e.target.value }))} />
          </label>
        ))}
      </div>
      <div className="row">
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan traffic"}</button>
      </div>
      <StatusLine s={status} />
    </form>
  );
}

export function UserForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setStatus(null);
    try {
      await send("/api/users", "POST", { nik: fd.get("nik"), name: fd.get("name"), password: fd.get("password"), active: fd.get("active") === "on" });
      setStatus({ kind: "ok", text: "Akun tersimpan" });
      form.reset();
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="stack" onSubmit={save}>
      <div className="grid c2">
        <label className="field">NIK<input name="nik" type="text" inputMode="numeric" required /></label>
        <label className="field">Nama<input name="name" type="text" maxLength={80} /></label>
      </div>
      <label className="field">Password (min 8; kosongkan jika hanya mengubah nama/status)<input name="password" type="password" autoComplete="new-password" /></label>
      <label className="row small"><input name="active" type="checkbox" defaultChecked /> Aktif</label>
      <div><button className="btn primary" type="submit" disabled={busy}>Simpan akun viewer</button></div>
      <StatusLine s={status} />
    </form>
  );
}

export function RulesForm({ overrides, effective }: { overrides: string; effective: string }) {
  const router = useRouter();
  const [text, setText] = useState(overrides);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text || "{}");
    } catch {
      setStatus({ kind: "error", text: "JSON tidak valid" });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await send("/api/settings/rules", "PUT", { overrides: parsed });
      setStatus({ kind: "ok", text: "Aturan tersimpan — semua halaman dihitung ulang" });
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="stack" onSubmit={save}>
      <label className="field">
        Override (JSON) — hanya kunci yang diisi yang menimpa default
        <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      <div><button className="btn primary" type="submit" disabled={busy}>Simpan aturan</button></div>
      <StatusLine s={status} />
      <details>
        <summary className="small muted" style={{ cursor: "pointer" }}>Aturan yang berlaku sekarang</summary>
        <pre className="small" style={{ overflowX: "auto", background: "var(--surface-2)", padding: 10, borderRadius: 8 }}>{effective}</pre>
      </details>
    </form>
  );
}
