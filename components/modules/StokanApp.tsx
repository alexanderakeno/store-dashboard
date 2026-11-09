"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ClipboardCheck, Download, Loader2, Play, RefreshCw, ScanLine, X } from "lucide-react";
import { loadSheetJS } from "./ImportRawForm";
import { StokanCounter, type CounterData } from "./StokanCounter";
import type { MonitorView } from "@/lib/domain/stokan";
import type { StokanMode, StokanSession, StokanStaff } from "@/types/stokan";

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const num = (n: number) => nf.format(n);
const rpShort = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(1).replace(".", ",")} M` : a >= 1e6 ? `${(a / 1e6).toFixed(1).replace(".", ",")} jt` : a >= 1e3 ? `${Math.round(a / 1e3)} rb` : `${Math.round(a)}`;
  return `${n < 0 ? "−" : n > 0 ? "+" : ""}Rp ${s}`;
};
const hm = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)) : "–");
const dmyhm = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const REASON: Record<string, string> = { value: "nilai tinggi", sold: "terjual minggu ini", diff: "pernah selisih", random: "acak", full: "semua" };

async function post(body: unknown) {
  const r = await fetch("/api/stokan/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Gagal (HTTP ${r.status})`);
  return j;
}

async function exportExcel(id: string, label: string) {
  const [r, XLSX] = await Promise.all([fetch(`/api/stokan/monitor?id=${encodeURIComponent(id)}&rows=1`).then((x) => x.json()), loadSheetJS()]);
  const X = XLSX as unknown as { utils: { json_to_sheet: (r: unknown[]) => unknown; book_new: () => unknown; book_append_sheet: (b: unknown, s: unknown, n: string) => void }; writeFile: (b: unknown, n: string) => void };
  const rows = (r.rows as Array<Record<string, unknown>>).map((x) => ({ Artikel: x.article, Deskripsi: x.description, Brand: x.brand, Kategori: x.category, Alasan: REASON[String(x.reason)] ?? x.reason, SOH: x.expected, "Hitung 1": x.count, "Hitung ulang": x.recount, Final: x.final, Selisih: x.diff, Harga: x.price, "Nilai selisih": x.value, Staff: x.staff, "Hitung ulang oleh": x.recountBy }));
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows), "Stokan");
  X.writeFile(wb, `Stokan ${label}.xlsx`);
}

/** Stokan Aksesoris: counting for everyone in the session; start / monitor / recount / close / history for the admin. */
export function StokanApp({ isAdmin, candidates, active, history, sohDate, sohToday }: { isAdmin: boolean; candidates: StokanStaff[]; active: StokanSession | null; history: StokanSession[]; sohDate: string | null; sohToday: boolean }) {
  const [counter, setCounter] = useState<CounterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [view, setView] = useState<string | null>(null);
  const router = useRouter();

  const openCounter = async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/stokan", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      if (!j.session) throw new Error("Tidak ada stokan yang berjalan.");
      if (!j.mine.length) throw new Error(j.phase === "recount" ? "Tidak ada artikel hitung ulang untuk Anda." : "Anda tidak punya bagian di stokan ini.");
      setCounter(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {active && (
        <section className="sd-hero p-5 sm:p-6">
          <p className="text-xs font-black tracking-[.12em] text-white/80 uppercase">Stokan berjalan · {active.status === "recount" ? "Hitung ulang" : "Hitung"}</p>
          <p className="mt-1 text-2xl font-black">{active.label}</p>
          <p className="mt-1 text-sm text-white/85">Mulai {dmyhm(active.startedAt)} · {active.staff.length} staff · acuan SOH {active.sohDate ? active.sohDate.split("-").reverse().join("/") : "–"}</p>
          {active.staff.length > 0 && (
            <button type="button" onClick={() => void openCounter()} disabled={loading} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-base font-extrabold text-blue-700 shadow-lg active:scale-95">
              {loading ? <Loader2 className="size-5 animate-spin" /> : <ScanLine className="size-5" />} {active.status === "recount" ? "Mulai hitung ulang (bagian saya)" : "Mulai hitung (bagian saya)"}
            </button>
          )}
          {err && <p className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold">{err}</p>}
        </section>
      )}
      {!active && !isAdmin && (
        <div className="sd-panel p-6 text-center text-sm text-slate-500">Belum ada stokan yang berjalan. Admin akan memulai stokan, lalu bagian Anda muncul di sini.</div>
      )}
      {isAdmin && !active && <StartForm candidates={candidates} sohDate={sohDate} sohToday={sohToday} onStarted={() => router.refresh()} />}
      {isAdmin && active && <Monitor session={active} live onChanged={() => router.refresh()} />}
      {isAdmin && view && history.find((h) => h.id === view) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><p className="font-black">Hasil {history.find((h) => h.id === view)!.label}</p><button type="button" className="sd-btn" onClick={() => setView(null)}><X className="size-4" /> Tutup</button></div>
          <Monitor session={history.find((h) => h.id === view)!} live={false} onChanged={() => router.refresh()} />
        </div>
      )}
      {isAdmin && <History history={history} onView={setView} />}
      {counter && <StokanCounter data={counter} onClose={() => (setCounter(null), router.refresh())} />}
    </>
  );
}

type Preview = { items: number; units: number; reasons: Record<string, number>; brands: Array<{ brand: string; items: number; units: number }> };

/** Even split suggestion: biggest brands first, each to the staff with the fewest articles so far. */
function suggest(brands: Preview["brands"], staff: string[]): Record<string, string> {
  const load = new Map(staff.map((n) => [n, 0]));
  const out: Record<string, string> = {};
  for (const b of brands) {
    const who = staff.reduce((best, n) => (load.get(n)! < load.get(best)! ? n : best), staff[0]);
    if (!who) continue;
    out[b.brand] = who;
    load.set(who, load.get(who)! + b.items);
  }
  return out;
}

function StartForm({ candidates, sohDate, sohToday, onStarted }: { candidates: StokanStaff[]; sohDate: string | null; sohToday: boolean; onStarted: () => void }) {
  const [mode, setMode] = useState<StokanMode>("rolling");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(candidates.map((c) => c.nik)));
  const [preview, setPreview] = useState<Record<StokanMode, Preview | null>>({ rolling: null, full: null });
  const [split, setSplit] = useState<"auto" | "manual">("auto");
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    for (const m of ["rolling", "full"] as const)
      post({ action: "preview", mode: m })
        .then((p) => setPreview((x) => ({ ...x, [m]: p })))
        .catch((e) => setErr((e as Error).message));
  }, []);
  const p = (m: StokanMode) => preview[m];
  const staffList = candidates.filter((c) => picked.has(c.nik));
  const brands = p(mode)?.brands ?? [];
  // manual split: start from an even suggestion, keep the admin's changes; staff no longer picked fall back to the suggestion
  const fill = () => setAssign(suggest(brands, staffList.map((c) => c.nik)));
  useEffect(() => {
    if (split !== "manual") return;
    setAssign((a) => {
      const sug = suggest(brands, staffList.map((c) => c.nik));
      const out: Record<string, string> = {};
      for (const b of brands) out[b.brand] = b.brand in a && (a[b.brand] === "" || picked.has(a[b.brand])) ? a[b.brand] : (sug[b.brand] ?? "");
      return out;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split, mode, picked, preview]);
  const load = (nik: string) => brands.filter((b) => assign[b.brand] === nik).reduce((a, b) => a + b.items, 0);
  const counted = split === "manual" ? brands.filter((b) => assign[b.brand]).reduce((a, b) => a + b.items, 0) : (p(mode)?.items ?? 0);

  const start = async () => {
    setBusy(true);
    setErr("");
    try {
      await post({ action: "start", mode, staff: [...picked], ...(split === "manual" ? { assign } : {}) });
      onStarted();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <section className="sd-panel space-y-4 p-5 sm:p-6">
      <div>
        <p className="text-lg font-black">Mulai Stokan</p>
        <p className="text-sm text-slate-500">Aksesoris + AirPods yang ada stoknya di SOH. Jumlah SOH tidak terlihat oleh staff yang menghitung.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Jenis stokan">
        {(["rolling", "full"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`rounded-2xl border-2 p-3 text-left ${mode === m ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30" : "border-slate-200 dark:border-slate-700"}`}>
            <span className="flex items-center justify-between gap-2"><b>{m === "rolling" ? "Bergilir (mingguan)" : "Penuh (bulanan)"}</b><span className="sd-badge blue">{p(m) ? `${num(p(m)!.items)} artikel` : "…"}</span></span>
            <span className="mt-1 block text-xs text-slate-500">
              {m === "rolling" ? (p(m) ? Object.entries(p(m)!.reasons).map(([k, v]) => `${REASON[k] ?? k} ${v}`).join(" · ") : "Nilai tinggi · terjual minggu ini · pernah selisih · acak 20%") : p(m) ? `Semua aksesoris di SOH · ${num(p(m)!.units)} pcs` : "Semua aksesoris di SOH"}
            </span>
          </button>
        ))}
      </div>
      <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${sohToday ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200" : "bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200"}`}>
        {sohToday ? <ClipboardCheck className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
        <span>Acuan SOH: <b>{sohDate ? sohDate.split("-").reverse().join("/") : "belum ada"}</b>{sohToday ? " — terbaru." : " — bukan hari ini. Import SOH hari ini dulu supaya selisihnya akurat."}</span>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-black tracking-[.1em] text-slate-500 uppercase">Staff yang ikut ({picked.size})</p>
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => (
            <label key={c.nik} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${picked.has(c.nik) ? "border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}>
              <input type="checkbox" className="sr-only" checked={picked.has(c.nik)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(c.nik)) n.delete(c.nik); else n.add(c.nik); return n; })} />
              {c.name}{split === "manual" && picked.has(c.nik) ? <span className="text-xs font-semibold opacity-70">· {load(c.nik)}</span> : null}
            </label>
          ))}
          {!candidates.length && <p className="text-sm text-slate-500">Belum ada user staff. Tambahkan di Settings → User.</p>}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-black tracking-[.1em] text-slate-500 uppercase">Pembagian bagian</p>
        <div className="inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800" role="radiogroup" aria-label="Pembagian bagian">
          {(["auto", "manual"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={split === k} onClick={() => setSplit(k)} className={`rounded-xl px-4 py-2 text-sm font-bold ${split === k ? "bg-white text-slate-950 shadow-sm dark:bg-slate-600 dark:text-white" : "text-slate-500"}`}>
              {k === "auto" ? "Otomatis (rotasi per brand)" : "Atur sendiri per brand"}
            </button>
          ))}
        </div>
        {split === "auto" && <p className="mt-2 text-xs text-slate-500">Brand dibagi rata ke staff dan bergeser setiap stokan, supaya tidak selalu menghitung brand yang sama.</p>}
        {split === "manual" && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">Pilih staff untuk tiap brand. Pilih <b>Tidak dihitung</b> untuk melewati brand di stokan ini. {num(counted)} dari {num(p(mode)?.items ?? 0)} artikel akan dihitung.</p>
              <button type="button" className="sd-btn !min-h-8 text-xs" onClick={fill} disabled={!staffList.length}>Bagi rata otomatis</button>
            </div>
            <div className="sd-table-wrap max-h-[420px] overflow-y-auto"><table className="sd-table">
              <thead><tr><th>Brand</th><th className="n">Artikel</th><th className="n">Pcs</th><th>Staff</th></tr></thead>
              <tbody>
                {brands.map((b) => (
                  <tr key={b.brand}>
                    <td className="font-bold">{b.brand}</td>
                    <td className="n">{b.items}</td>
                    <td className="n">{num(b.units)}</td>
                    <td>
                      <select className="sd-input !min-h-9 !py-1 text-sm" value={assign[b.brand] ?? ""} onChange={(e) => setAssign((a) => ({ ...a, [b.brand]: e.target.value }))} aria-label={`Staff untuk ${b.brand}`}>
                        <option value="">— Tidak dihitung —</option>
                        {staffList.map((c) => <option key={c.nik} value={c.nik}>{c.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </div>
      {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" role="alert">{err}</p>}
      <button type="button" className="sd-btn primary w-full justify-center !py-3 !text-base sm:w-auto" disabled={busy || !picked.size || !counted} onClick={() => void start()}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />} Mulai Stokan {counted ? `(${num(counted)} artikel)` : ""}
      </button>
    </section>
  );
}

function Monitor({ session, live, onChanged }: { session: StokanSession; live: boolean; onChanged: () => void }) {
  const [v, setV] = useState<MonitorView | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [all, setAll] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/stokan/monitor?id=${encodeURIComponent(session.id)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setV(j.view);
      setAt(new Date());
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [session.id]);
  useEffect(() => {
    void load();
    if (!live) return;
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 20_000);
    return () => clearInterval(t);
  }, [load, live]);

  const act = async (action: string, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setBusy(action);
    try {
      await post({ action, id: session.id });
      onChanged();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  if (!v) return <div className="sd-panel flex items-center gap-2 p-6 text-sm text-slate-500">{err ? <><AlertTriangle className="size-4 text-rose-600" /> {err}</> : <><Loader2 className="size-4 animate-spin" /> Memuat monitor…</>}</div>;

  const counting = session.status === "count";
  const recounting = session.status === "recount";
  const pct = v.items ? Math.round((v.counted / v.items) * 100) : 0;
  const idle = v.staff.filter((s) => s.idle);
  const diffs = all ? v.diffs : v.diffs.slice(0, 15);
  const statusBadge = (s: string) => ({ counting: <span className="sd-badge slate">Belum final</span>, recount: <span className="sd-badge amber">Hitung ulang</span>, confirmed: <span className="sd-badge red">Terkonfirmasi</span>, resolved: <span className="sd-badge green">Cocok</span> })[s];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {session.label} · {Object.entries(v.reasons).map(([k, n]) => `${REASON[k] ?? k} ${n}`).join(" · ")}
          {live && at && <> · diperbarui {hm(at.toISOString())}</>}
        </p>
        <div className="flex flex-wrap gap-2">
          {live && <button type="button" className="sd-btn" onClick={() => void load()}><RefreshCw className="size-4" /> Perbarui</button>}
          <button type="button" className="sd-btn" onClick={() => void exportExcel(session.id, session.label).catch((e) => setErr((e as Error).message))}><Download className="size-4" /> Excel</button>
          {counting && <button type="button" className="sd-btn primary" disabled={!!busy} onClick={() => void act("recount", `Mulai hitung ulang? ${v.diff} artikel yang beda akan dihitung ulang oleh staff lain.${v.unchecked ? `\n\n⚠ ${v.unchecked} artikel belum dihitung sama sekali (staff-nya belum klik Selesai) — tidak ikut hitung ulang.` : ""}`)}>{busy === "recount" ? <Loader2 className="size-4 animate-spin" /> : null} Mulai hitung ulang</button>}
          {(counting || recounting) && <button type="button" className="sd-btn primary" disabled={!!busy} onClick={() => void act("close", `Tutup stokan & simpan hasil? Hasil akhir: ${v.matched} cocok, ${v.diff} selisih (${rpShort(v.diffValue)}).${v.unchecked ? `\n\n⚠ ${v.unchecked} artikel belum dihitung — tidak masuk hasil.` : ""}`)}>{busy === "close" ? <Loader2 className="size-4 animate-spin" /> : null} Setujui & tutup</button>}
          {(counting || recounting) && <button type="button" className="sd-btn" disabled={!!busy} onClick={() => void act("cancel", "Batalkan stokan ini? Hitungan tidak dipakai.")}>Batalkan</button>}
        </div>
      </div>
      {err && <div className="alert error" role="alert">{err}</div>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Progress" value={`${pct}%`} sub={`${num(v.counted)} / ${num(v.items)} artikel${v.eta ? ` · ETA ${hm(v.eta)}` : ""}${v.unchecked && !counting ? ` · ${num(v.unchecked)} belum dicek` : ""}`} bar={pct} />
        <Kpi label="Cocok" value={num(v.matched)} sub={v.items - v.unchecked ? `${Math.round((v.matched / Math.max(1, v.items - v.unchecked)) * 100)}% dari yang dicek` : "–"} tone="green" />
        <Kpi label={recounting || !live ? "Selisih" : "Selisih sementara"} value={num(v.diff)} sub={recounting ? `hitung ulang ${v.recountDone}/${v.recountTotal}` : counting ? "→ masuk hitung ulang" : "artikel"} tone="red" />
        <Kpi label="Nilai selisih" value={rpShort(v.diffValue)} sub="harga jual" tone="red" />
        <Kpi label="Terkonfirmasi" value={num(v.confirmed)} sub={v.confirmed ? `dicek 2 orang · ${rpShort(v.confirmedValue)}` : "setelah hitung ulang"} />
      </div>

      {(idle.length > 0 || v.extras.length > 0) && (
        <div className="alert warn flex flex-wrap items-center gap-x-3 gap-y-1">
          <AlertTriangle className="size-4" />
          {idle.map((s) => <span key={s.nik}><b>{s.name}</b> tidak scan sejak {hm(s.last)}</span>)}
          {v.extras.length > 0 && <span>{v.extras.length} barcode / artikel di luar daftar perlu dicek</span>}
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[1fr_1.1fr]">
        <section className="sd-panel p-4">
          <p className="mb-2 text-[11px] font-black tracking-[.1em] text-slate-500 uppercase">Staff</p>
          <div className="sd-table-wrap"><table className="sd-table">
            <thead><tr><th>Staff</th><th>Bagian</th><th className="n">Hitung</th>{(recounting || !live) && <th className="n">Ulang</th>}<th className="n">Speed</th><th className="n">Akurasi</th></tr></thead>
            <tbody>
              {v.staff.map((s) => (
                <tr key={s.nik}>
                  <td className="font-bold whitespace-nowrap">{s.name}{s.done && <span className="ml-1 text-emerald-600">✓</span>}</td>
                  <td className="text-xs text-slate-500">{s.brands.join(" · ") || "–"}</td>
                  <td className="n whitespace-nowrap">{s.counted}/{s.assigned}<div className="mt-1 h-1.5 w-20 overflow-hidden rounded bg-slate-200 dark:bg-slate-700"><i className={`block h-full ${s.idle ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${s.assigned ? (s.counted / s.assigned) * 100 : 0}%` }} /></div></td>
                  {(recounting || !live) && <td className="n">{s.recountAssigned ? `${s.recounted}/${s.recountAssigned}${s.recountDone ? " ✓" : ""}` : "–"}</td>}
                  <td className="n">{s.speed ?? "–"}</td>
                  <td className="n">{s.accuracy != null ? `${Math.round(s.accuracy)}%` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="mt-2 text-[11px] text-slate-500">Speed = artikel per jam. Akurasi = hitungan pertama yang terbukti benar (muncul setelah hitung ulang).</p>
          {counting && live && <Reassign session={session} view={v} onDone={load} />}
        </section>
        <section className="sd-panel p-4">
          <p className="mb-2 text-[11px] font-black tracking-[.1em] text-slate-500 uppercase">Selisih terbesar (Rp)</p>
          {diffs.length ? (
            <div className="sd-table-wrap"><table className="sd-table">
              <thead><tr><th>Artikel</th><th className="n">SOH</th><th className="n">Hitung</th><th className="n">Rp</th><th>Status</th></tr></thead>
              <tbody>
                {diffs.map((d) => (
                  <tr key={d.article}>
                    <td><b className="text-[13px]">{d.description}</b><div className="text-[11px] text-slate-500">{d.brand} · {d.assignee}{d.recountBy ? ` → ${d.recountBy}` : ""}</div></td>
                    <td className="n">{d.expected}</td>
                    <td className="n">{d.recount != null ? <>{d.recount}<div className="text-[10px] text-slate-400">awal {d.count ?? 0}</div></> : (d.count ?? 0)}</td>
                    <td className={`n font-bold ${d.value < 0 ? "text-rose-600" : "text-amber-600"}`}><span className="whitespace-nowrap">{rpShort(d.value)}</span></td>
                    <td>{statusBadge(d.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className="py-6 text-center text-sm text-slate-500">{v.counted ? "Belum ada selisih 👍" : "Belum ada yang dihitung."}</p>}
          {v.diffs.length > 15 && <button type="button" className="sd-btn mt-2 w-full justify-center" onClick={() => setAll((x) => !x)}>{all ? "Ringkas" : `Tampilkan semua (${v.diffs.length})`}</button>}
          {v.extras.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
              <p className="text-[11px] font-black tracking-[.1em] text-slate-500 uppercase">Di luar daftar / tidak dikenal</p>
              {v.extras.slice(0, 10).map((x) => <p key={x.code || x.article} className="flex justify-between py-1 text-xs"><span className="font-mono">{x.code || x.article}</span><span>{x.times}× · {x.by}</span></p>)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** "Ubah bagian": move a brand to another staff while counting (their phone picks it up when they reopen the counter). */
function Reassign({ session, view, onDone }: { session: StokanSession; view: MonitorView; onDone: () => Promise<void> }) {
  const [brand, setBrand] = useState("");
  const [nik, setNik] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const name = new Map(session.staff.map((s) => [s.nik, s.name]));
  const go = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await post({ action: "reassign", id: session.id, brand, nik });
      setMsg(`${r.moved} artikel ${brand} dipindah ke ${name.get(nik)}. Minta ${name.get(nik)} buka ulang layar hitung.`);
      await onDone();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <summary className="cursor-pointer text-sm font-bold">Ubah bagian staff</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <select className="sd-input" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand">
          <option value="">Pilih brand…</option>
          {view.brands.map((b) => <option key={`${b.brand}|${b.assignee}`} value={b.brand}>{b.brand} · {name.get(b.assignee) ?? b.assignee} ({b.counted}/{b.items})</option>)}
        </select>
        <select className="sd-input" value={nik} onChange={(e) => setNik(e.target.value)} aria-label="Pindah ke staff">
          <option value="">Pindah ke…</option>
          {session.staff.map((s) => <option key={s.nik} value={s.nik}>{s.name}</option>)}
        </select>
        <button type="button" className="sd-btn primary justify-center" disabled={!brand || !nik || busy} onClick={() => void go()}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Pindahkan</button>
      </div>
      {msg && <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{msg}</p>}
    </details>
  );
}

function Kpi({ label, value, sub, tone, bar }: { label: string; value: string; sub: string; tone?: "green" | "red"; bar?: number }) {
  return (
    <div className="sd-panel p-3 sm:p-4">
      <p className="text-[10px] font-black tracking-[.1em] text-slate-500 uppercase">{label}</p>
      <p className={`text-xl font-black tabular-nums sm:text-2xl ${tone === "green" ? "text-emerald-600" : tone === "red" ? "text-rose-600" : ""}`}>{value}</p>
      {bar != null && <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-700"><i className="block h-full bg-emerald-500" style={{ width: `${bar}%` }} /></div>}
      <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}

function History({ history, onView }: { history: StokanSession[]; onView: (id: string) => void }) {
  return (
    <section className="sd-panel p-5">
      <p className="mb-2 font-black">Histori Stokan</p>
      {history.length ? (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <p className="font-bold">{h.label} {h.status === "cancelled" && <span className="sd-badge slate">dibatalkan</span>}</p>
                <p className="text-xs text-slate-500">{dmyhm(h.startedAt)} · {h.staff.length} staff{h.summary ? ` · ${num(h.summary.items)} artikel · ${num(h.summary.matched)} cocok · ${num(h.summary.diff)} selisih · ${rpShort(h.summary.diffValue)}` : ""}</p>
              </div>
              {h.status === "closed" && (
                <div className="flex gap-2">
                  <button type="button" className="sd-btn" onClick={() => onView(h.id)}>Lihat</button>
                  <button type="button" className="sd-btn" onClick={() => void exportExcel(h.id, h.label)}><Download className="size-4" /> Excel</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500">Belum ada histori stokan.</p>}
    </section>
  );
}
