"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CloudOff, Keyboard, Loader2, Minus, Plus, X, Zap } from "lucide-react";
import { normCode } from "@/lib/domain/scan";
import { useBarcodeCamera } from "./useBarcodeCamera";
import type { StokanEvent, StokanPhase } from "@/types/stokan";

type Index = Array<[article: string, description: string, brand: string, barcodes: string, owner: string]>;
export interface CounterData {
  session: { id: string; label: string; status: string };
  phase: StokanPhase;
  me: { nik: string; name: string };
  mine: string[];
  done: boolean;
  index: Index;
  counts: Record<string, number>;
}
type Pending = Omit<StokanEvent, "nik" | "name">;

const qKey = (id: string) => `sd-stokan-q-${id}`;
const readQ = (id: string): Pending[] => {
  try {
    return JSON.parse(localStorage.getItem(qKey(id)) ?? "[]");
  } catch {
    return [];
  }
};
const writeQ = (id: string, q: Pending[]) => {
  try {
    localStorage.setItem(qKey(id), JSON.stringify(q));
  } catch {}
};
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Article of a scanned / typed code inside the session: barcode → article → the article that ends with the code. */
function matcher(index: Index) {
  const byBarcode = new Map<string, string>();
  const byArticle = new Map<string, string>();
  for (const [a, , , bc] of index) {
    byArticle.set(normCode(a), a);
    for (const b of bc.split(" ").filter(Boolean)) byBarcode.set(normCode(b), a);
  }
  return (code: string): string | null => {
    const c = normCode(code);
    if (c.length < 4) return null;
    const hit = byBarcode.get(c) ?? byArticle.get(c);
    if (hit) return hit;
    if (c.length < 8) return null;
    const ends = index.filter(([a]) => normCode(a).endsWith(c));
    return ends.length === 1 ? ends[0][0] : null;
  };
}

/**
 * Counting screen (phone): back camera always on, every read = +1 on its article; typed qty / corrections = set.
 * The SOH qty is never shown (blind count). Actions queue on the phone (survive a lost signal or a reload) and are
 * sent every few seconds.
 */
export function StokanCounter({ data, onClose }: { data: CounterData; onClose: () => void }) {
  const sid = data.session.id;
  const [queue, setQueue] = useState<Pending[]>(() => readQ(sid));
  // counts saved on the server (this phone's sent actions are added to it)
  const [base, setBase] = useState<Record<string, number>>(data.counts);
  const [sending, setSending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const [edit, setEdit] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [finished, setFinished] = useState(data.done);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const info = useMemo(() => new Map(data.index.map((r) => [r[0], r])), [data.index]);
  const match = useMemo(() => matcher(data.index), [data.index]);
  const mine = useMemo(() => new Set(data.mine), [data.mine]);

  // counts = server counts + this phone's queued actions, replayed in order
  const counts = useMemo(() => {
    const c: Record<string, number> = { ...base };
    for (const e of queue) {
      if (e.kind === "add") c[e.article] = Math.max(0, (c[e.article] ?? 0) + e.value);
      else if (e.kind === "set") c[e.article] = Math.max(0, e.value);
    }
    return c;
  }, [base, queue]);

  const push = useCallback(
    (e: Omit<Pending, "id" | "ts" | "phase">) => {
      setQueue((q) => {
        const next = [...q, { ...e, id: uid(), ts: new Date().toISOString(), phase: data.phase }];
        writeQ(sid, next);
        return next;
      });
    },
    [sid, data.phase],
  );

  const say = (ok: boolean, text: string) => {
    setToast({ ok, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const onCode = useCallback(
    (code: string) => {
      const a = match(code);
      navigator.vibrate?.(a ? 50 : [40, 60, 40]);
      if (!a) {
        push({ article: "", code, kind: "extra", value: 1 });
        return say(false, `Tidak ada di daftar stokan · ${code}`);
      }
      push({ article: a, code, kind: "add", value: 1 });
      const r = info.get(a)!;
      say(true, `+1 ${r[1]}${mine.has(a) ? "" : ` · bagian ${r[4] || "lain"}`}`);
    },
    [match, push, info, mine],
  );
  const cam = useBarcodeCamera(onCode, { cooldownMs: 1000 });

  // send the queue every 3 s (and when the page is hidden)
  const flush = useCallback(async () => {
    const q = readQ(sid);
    if (!q.length || sending) return;
    setSending(true);
    try {
      const r = await fetch("/api/stokan/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: sid, events: q.slice(0, 400) }) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        if (r.status === 400 && /ditutup/.test(j.error ?? "")) say(false, j.error);
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const sent = new Set(q.slice(0, 400).map((e) => e.id));
      const rest = readQ(sid).filter((e) => !sent.has(e.id));
      writeQ(sid, rest);
      // what was sent is now part of the saved counts
      setBase((b) => {
        const n = { ...b };
        for (const e of q.slice(0, 400)) {
          if (e.kind === "add") n[e.article] = Math.max(0, (n[e.article] ?? 0) + e.value);
          else if (e.kind === "set") n[e.article] = Math.max(0, e.value);
        }
        return n;
      });
      setQueue(rest);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setSending(false);
    }
  }, [sid, sending]);
  useEffect(() => {
    const t = setInterval(() => void flush(), 3000);
    const vis = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", vis);
    document.documentElement.style.overflow = "hidden";
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
      document.documentElement.style.overflow = "";
    };
  }, [flush]);

  cam.paused.current = !!edit || typing || finished;
  const list = data.mine.map((a) => info.get(a)!).filter(Boolean);
  const todo = list.filter((r) => counts[r[0]] == null);
  const doneList = list.filter((r) => counts[r[0]] != null);
  const shown = tab === "todo" ? todo : doneList;

  const saveEdit = () => {
    if (!edit) return;
    const v = Math.max(0, Math.round(Number(editVal) || 0));
    push({ article: edit, kind: "set", value: v });
    setEdit(null);
  };
  const finish = () => {
    if (todo.length && !window.confirm(`${todo.length} artikel belum dihitung akan dianggap TIDAK ADA (0). Sudah cari di rak, display & gudang?`)) return;
    push({ article: "", kind: "done", value: 1 });
    setFinished(true);
    void flush();
  };
  const close = async () => {
    await flush();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-white" role="dialog" aria-modal="true" aria-label="Hitung stokan">
      <div className="relative h-[34vh] min-h-48 shrink-0 bg-black text-white">
        <video ref={cam.video} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
        {!cam.error && (
          <div className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-2xl border-[3px] border-white/90">
            <span className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-rose-500 shadow-[0_0_10px_#ef4444]" />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3 pt-[calc(.75rem+env(safe-area-inset-top))]">
          <button type="button" onClick={() => void close()} className="grid size-9 place-items-center rounded-xl bg-black/55" aria-label="Tutup"><X className="size-5" /></button>
          <span className="rounded-full bg-black/55 px-3 py-1.5 text-sm font-extrabold">{data.me.name.split(" ")[0]} · {doneList.length}/{list.length}{data.phase === "recount" ? " · hitung ulang" : ""}</span>
          {cam.torch !== null ? <button type="button" onClick={cam.toggleTorch} className={`grid size-9 place-items-center rounded-xl ${cam.torch ? "bg-amber-400 text-black" : "bg-black/55"}`} aria-label="Senter"><Zap className="size-5" /></button> : <span className="size-9" />}
        </div>
        {(cam.starting || cam.error) && <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-sm font-bold">{cam.starting ? "Membuka kamera…" : cam.error}</p>}
        {toast && <div className={`absolute inset-x-3 bottom-3 rounded-2xl px-3 py-2.5 text-sm font-extrabold shadow-lg ${toast.ok ? "bg-emerald-600" : "bg-amber-500 text-black"}`} role="status">{toast.ok && <Check className="mr-1 inline size-4" />}{toast.text}</div>}
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3 pt-3">
        {(["todo", "done"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-xl py-2 text-sm font-extrabold ${tab === k ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
            {k === "todo" ? `Belum ${todo.length}` : `Sudah ${doneList.length}`}
          </button>
        ))}
        <span className={`flex items-center gap-1 text-[11px] font-bold ${offline ? "text-amber-600" : "text-slate-400"}`} title="Antrian kirim">
          {offline ? <CloudOff className="size-4" /> : sending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {queue.length ? `${queue.length} antre` : "tersimpan"}
        </span>
      </div>
      {data.phase === "recount" && <p className="mx-3 mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Artikel ini dihitung staff lain & hasilnya beda. Cari lagi di rak, display, dan gudang.</p>}

      <ul className="mx-3 my-2 flex-1 divide-y divide-slate-100 overflow-y-auto rounded-2xl bg-white px-3 dark:divide-slate-800 dark:bg-slate-900">
        {shown.map((r) => (
          <li key={r[0]}>
            <button type="button" onClick={() => (setEdit(r[0]), setEditVal(String(counts[r[0]] ?? 0)))} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
              <span className="min-w-0">
                <span className="block text-[13px] leading-snug font-bold">{r[1]}</span>
                <span className="block font-mono text-[11px] text-slate-400">{r[0]} · {r[2]}</span>
              </span>
              {counts[r[0]] != null ? <b className="shrink-0 text-lg tabular-nums">{counts[r[0]]}</b> : <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-800">belum</span>}
            </button>
          </li>
        ))}
        {!shown.length && <li className="py-8 text-center text-sm text-slate-500">{tab === "todo" ? "Semua artikel bagian Anda sudah dihitung 🎉" : "Belum ada yang dihitung."}</li>}
      </ul>
      <p className="mx-3 text-center text-[11px] text-slate-500">🔒 Jumlah SOH disembunyikan — hitung apa adanya, termasuk display & gudang. Ketuk artikel untuk ubah jumlah.</p>
      <div className="flex shrink-0 gap-2.5 p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))]">
        <button type="button" className="sd-btn flex-1 justify-center !py-3" onClick={() => setTyping(true)}><Keyboard className="size-4" /> Ketik kode</button>
        <button type="button" className="sd-btn primary flex-1 justify-center !py-3" disabled={finished} onClick={finish}>{finished ? "Bagian selesai ✓" : "Selesai bagian"}</button>
      </div>

      {(edit || typing) && (
        <div className="absolute inset-0 flex items-end bg-black/40" onClick={() => (setEdit(null), setTyping(false))}>
          <div className="w-full rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            {edit ? (
              <form onSubmit={(e) => (e.preventDefault(), saveEdit())} className="space-y-4">
                <div>
                  <p className="font-extrabold leading-snug">{info.get(edit)?.[1]}</p>
                  <p className="font-mono text-xs text-slate-400">{edit}</p>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button type="button" className="grid size-12 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800" onClick={() => setEditVal(String(Math.max(0, (Number(editVal) || 0) - 1)))} aria-label="Kurangi"><Minus className="size-5" /></button>
                  <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="sd-input w-28 text-center text-3xl font-black" aria-label="Jumlah dihitung" />
                  <button type="button" className="grid size-12 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800" onClick={() => setEditVal(String((Number(editVal) || 0) + 1))} aria-label="Tambah"><Plus className="size-5" /></button>
                </div>
                <div className="flex gap-2.5">
                  <button type="button" className="sd-btn flex-1 justify-center !py-3" onClick={() => setEdit(null)}>Batal</button>
                  <button type="submit" className="sd-btn primary flex-1 justify-center !py-3">Simpan jumlah</button>
                </div>
              </form>
            ) : (
              <form onSubmit={(e) => {
                e.preventDefault();
                const a = match(typed);
                if (!a) return say(false, `Kode ${typed} tidak ada di daftar stokan`);
                setTyping(false);
                setTyped("");
                setEdit(a);
                setEditVal(String((counts[a] ?? 0) + 1));
              }} className="space-y-3">
                <p className="font-extrabold">Ketik barcode atau kode artikel</p>
                <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" className="sd-input w-full" placeholder="mis. 8886463690277 atau APPMD3J4ZA/A" />
                <div className="flex gap-2.5">
                  <button type="button" className="sd-btn flex-1 justify-center !py-3" onClick={() => setTyping(false)}>Batal</button>
                  <button type="submit" className="sd-btn primary flex-1 justify-center !py-3" disabled={typed.trim().length < 4}>Cari</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
