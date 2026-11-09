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

function StartForm({ candidates, sohDate, sohToday, onStarted }: { candidates: StokanStaff[]; sohDate: string | null; sohToday: boolean; onStarted: () => void }) {
  const [mode, setMode] = useState<StokanMode>("rolling");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(candidates.map((c) => c.nik)));
  const [preview, setPreview] = useState<Record<StokanMode, { items: number; units: number; reasons: Record<string, number> } | null>>({ rolling: null, full: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    for (const m of ["rolling", "full"] as const)
      post({ action: "preview", mode: m })
        .then((p) => setPreview((x) => ({ ...x, [m]: p })))
        .catch((e) => setErr((e as Error).message));
  }, []);
  const start = async () => {
    setBusy(true);
    setErr("");
    try {
      await post({ action: "start", mode, staff: [...picked] });
      onStarted();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  const p = (m: StokanMode) => preview[m];
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
        <p className="mb-2 text-[11px] font-black tracking-[.1em] text-slate-500 uppercase">Staff yang ikut ({picked.size}) · bagian dibagi otomatis per brand & dirotasi tiap stokan</p>
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => (
            <label key={c.nik} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${picked.has(c.nik) ? "border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}>
              <input type="checkbox" className="sr-only" checked={picked.has(c.nik)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(c.nik)) n.delete(c.nik); else n.add(c.nik); return n; })} />
              {c.name}
            </label>
          ))}
          {!candidates.length && <p className="text-sm text-slate-500">Belum ada user staff. Tambahkan di Settings → User.</p>}
        </div>
      </div>
      {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" role="alert">{err}</p>}
      <button type="button" className="sd-btn primary w-full justify-center !py-3 !text-base sm:w-auto" disabled={busy || !picked.size || !p(mode)?.items} onClick={() => void start()}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />} Mulai Stokan {p(mode) ? `(${num(p(mode)!.items)} artikel)` : ""}
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
