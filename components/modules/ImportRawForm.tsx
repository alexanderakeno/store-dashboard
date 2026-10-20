"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { postJson } from "./postJson";

type Row = Array<string | number | boolean | null>;
type Rows = Row[];
type Slot = "mr" | "sp";
interface Picked {
  file: File;
  rows: Rows | null;
  error: string | null;
}

const ACCEPT = ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Columns the Apps Script parsers read: MR uses A..I, Sales Person A..C. Everything else is dropped before upload. */
const SLOTS: Array<{ key: Slot; title: string; hint: string; cols: number }> = [
  { key: "mr", title: "Merchandise Report", hint: "Menimpa kolom G:O mulai baris 7", cols: 9 },
  { key: "sp", title: "Sales Person", hint: "Menimpa kolom Q:Y mulai baris 7", cols: 3 },
];

/** Same SheetJS build as the Apps Script dialog (ImportDialog.html), loaded only on this page. */
const SHEETJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

interface SheetJS {
  read(data: Uint8Array, opts: { type: "array" }): { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_json(ws: unknown, opts: { header: 1; raw: true; defval: null; blankrows: true }): Rows };
}

let sheetjs: Promise<SheetJS> | null = null;
export function loadSheetJS(): Promise<SheetJS> {
  const w = window as unknown as { XLSX?: SheetJS };
  if (w.XLSX) return Promise.resolve(w.XLSX);
  sheetjs ??= new Promise<SheetJS>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SHEETJS_URL;
    s.async = true;
    s.onload = () => (w.XLSX ? resolve(w.XLSX) : reject(new Error("Library pembaca Excel gagal dimuat")));
    s.onerror = () => {
      sheetjs = null;
      s.remove();
      reject(new Error("Library pembaca Excel gagal dimuat. Cek koneksi internet lalu coba lagi."));
    };
    document.head.appendChild(s);
  });
  return sheetjs;
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

/** Reads the first sheet like the Apps Script dialog (header:1, raw, blank rows kept), trimmed to `cols` columns. */
export async function readRows(file: File, cols: number): Promise<Rows> {
  const XLSX = await loadSheetJS();
  let rows: Rows;
  try {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: true });
  } catch (e) {
    throw new Error(`Gagal membaca ${file.name}: ${(e as Error).message}`);
  }
  const out = rows.map((r) => {
    const t = (r ?? []).slice(0, cols);
    while (t.length && isEmpty(t[t.length - 1])) t.pop();
    return t;
  });
  while (out.length && !out[out.length - 1].length) out.pop(); // trailing blank rows
  return out;
}

const looksLikeMR = (rows: Rows) => String(rows[0]?.[0] ?? "").trim().toLowerCase() === "brand name";
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function check(slot: Slot, rows: Rows): string | null {
  if (slot === "mr" && !looksLikeMR(rows)) return 'Bukan Merchandise Report (header "Brand Name" tidak ditemukan).';
  if (slot === "sp" && looksLikeMR(rows)) return "Ini file Merchandise Report — pilih file Sales Person.";
  return null;
}

export function ImportRawForm({ month, monthLabel, sourceTitle }: { month: string; monthLabel: string; sourceTitle: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<Slot, Picked | null>>({ mr: null, sp: null });
  const [state, setState] = useState<"idle" | "busy" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const inputs = { mr: useRef<HTMLInputElement>(null), sp: useRef<HTMLInputElement>(null) };

  // Warm the Excel reader while the user looks for the file (browser caches it after the first time).
  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => void loadSheetJS().catch(() => {}));
  }, []);

  /** Parse right away on selection: wrong files are caught before Import, and Import only uploads. */
  const pick = async (slot: Slot, file: File | null) => {
    if (state !== "busy") setState("idle");
    if (!file) return setPicked((s) => ({ ...s, [slot]: null }));
    setPicked((s) => ({ ...s, [slot]: { file, rows: null, error: null } }));
    const cols = SLOTS.find((x) => x.key === slot)!.cols;
    let next: Picked;
    try {
      const rows = await readRows(file, cols);
      next = { file, rows, error: check(slot, rows) };
    } catch (e) {
      next = { file, rows: null, error: (e as Error).message };
    }
    setPicked((s) => (s[slot]?.file === file ? { ...s, [slot]: next } : s));
  };
  const clear = (slot: Slot) => {
    void pick(slot, null);
    const el = inputs[slot].current;
    if (el) el.value = "";
  };

  const parsing = SLOTS.some((s) => picked[s.key] && !picked[s.key]!.rows && !picked[s.key]!.error);
  const hasError = SLOTS.some((s) => picked[s.key]?.error);
  const ready = SLOTS.some((s) => picked[s.key]?.rows) && !parsing && !hasError;
  const busy = state === "busy";

  const run = async () => {
    if (!ready) return;
    setState("busy");
    setMsg("");
    try {
      const r = await postJson("/api/import-raw", { month, mr: picked.mr?.rows ?? null, sp: picked.sp?.rows ?? null });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Import gagal (HTTP ${r.status})`);
      setMsg(j.message ?? "Selesai.");
      setState("ok");
      setPicked({ mr: null, sp: null });
      for (const k of ["mr", "sp"] as const) if (inputs[k].current) inputs[k].current!.value = "";
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
      setState("error");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Tujuan: <b className="text-slate-700 dark:text-slate-200">{monthLabel}</b> · {sourceTitle} · tab <b>Control MR &amp;SP</b>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {SLOTS.map((s) => {
          const p = picked[s.key];
          const bad = !!p?.error;
          const ok = !!p?.rows && !bad;
          return (
            <div
              key={s.key}
              className={`relative rounded-2xl border-2 border-dashed p-4 transition ${bad ? "border-rose-400 bg-rose-50/60 dark:bg-rose-950/20" : ok ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-slate-300 dark:border-slate-700"}`}
            >
              <label className="flex min-h-[72px] cursor-pointer items-center gap-3">
                <input
                  ref={inputs[s.key]}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => void pick(s.key, e.target.files?.[0] ?? null)}
                />
                <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${bad ? "bg-rose-500 text-white" : ok ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                  {p && !p.rows && !p.error ? <Loader2 className="size-6 animate-spin" /> : <FileSpreadsheet className="size-6" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-950">{s.title}</span>
                  {!p && <span className="block text-sm text-slate-500">Ketuk untuk pilih file .xls</span>}
                  {p && (
                    <span className={`block truncate text-sm ${bad ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-400"}`}>
                      {p.file.name} · {kb(p.file.size)}
                      {p.rows && !bad ? ` · ${p.rows.length} baris` : ""}
                      {!p.rows && !p.error ? " · membaca…" : ""}
                    </span>
                  )}
                  {bad ? <span className="block text-xs font-semibold text-rose-700 dark:text-rose-300">{p!.error}</span> : <span className="block text-xs text-slate-400">{s.hint}</span>}
                </span>
              </label>
              {p && !busy && (
                <button type="button" onClick={() => clear(s.key)} className="absolute top-2 right-2 grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-200/70" aria-label={`Hapus file ${s.title}`}>
                  <X className="size-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" className="sd-btn primary w-full justify-center !py-3 !text-base" onClick={run} disabled={!ready || busy}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
        {busy ? "Menulis ke Google Sheet… (bisa 10–40 detik)" : "Import ke Google Sheet"}
      </button>

      {state === "ok" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" role="status">
          <p className="mb-1 flex items-center gap-2 font-bold"><CheckCircle2 className="size-4" /> Import selesai</p>
          {msg.split("\n").map((l, i) => (
            <p key={i} className={l.startsWith("PERHATIAN") ? "mt-1 font-semibold text-amber-700 dark:text-amber-300" : ""}>{l}</p>
          ))}
        </div>
      )}
      {state === "error" && (
        <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{msg}</span>
        </div>
      )}
    </div>
  );
}
