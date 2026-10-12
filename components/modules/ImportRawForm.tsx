"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";

type Rows = Array<Array<string | number | boolean | null>>;
type Slot = "mr" | "sp";

const ACCEPT = ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Vercel rejects request bodies above ~4.5 MB. */
const MAX_BODY = 4_300_000;

const SLOTS: Array<{ key: Slot; title: string; hint: string }> = [
  { key: "mr", title: "Merchandise Report", hint: "Menimpa kolom G:O mulai baris 7" },
  { key: "sp", title: "Sales Person", hint: "Menimpa kolom Q:Y mulai baris 7" },
];

/** Same SheetJS build as the Apps Script dialog (ImportDialog.html), loaded only on this page. */
const SHEETJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

interface SheetJS {
  read(data: Uint8Array, opts: { type: "array" }): { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_json(ws: unknown, opts: { header: 1; raw: true; defval: null; blankrows: true }): Rows };
}

let sheetjs: Promise<SheetJS> | null = null;
function loadSheetJS(): Promise<SheetJS> {
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

/** Reads the first sheet exactly like the Apps Script dialog (header:1, raw, blank rows kept). */
async function readRows(file: File): Promise<Rows> {
  const XLSX = await loadSheetJS();
  let rows: Rows;
  try {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: true });
  } catch (e) {
    throw new Error(`Gagal membaca ${file.name}: ${(e as Error).message}`);
  }
  // Parsers only look at the first 9 columns; drop the rest and trailing empties to keep the upload small.
  return rows.map((r) => {
    const t = (r ?? []).slice(0, 12);
    while (t.length && (t[t.length - 1] === null || t[t.length - 1] === "")) t.pop();
    return t;
  });
}

const looksLikeMR = (rows: Rows) => String(rows[0]?.[0] ?? "").trim().toLowerCase() === "brand name";
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function ImportRawForm({ month, monthLabel, sourceTitle }: { month: string; monthLabel: string; sourceTitle: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<Record<Slot, File | null>>({ mr: null, sp: null });
  const [state, setState] = useState<"idle" | "busy" | "ok" | "error">("idle");
  const [step, setStep] = useState("");
  const [msg, setMsg] = useState("");
  const inputs = { mr: useRef<HTMLInputElement>(null), sp: useRef<HTMLInputElement>(null) };

  const pick = (k: Slot, f: File | null) => {
    setFiles((s) => ({ ...s, [k]: f }));
    if (state !== "busy") setState("idle");
  };
  const clear = (k: Slot) => {
    pick(k, null);
    const el = inputs[k].current;
    if (el) el.value = "";
  };

  const run = async () => {
    if (!files.mr && !files.sp) return;
    setState("busy");
    setMsg("");
    try {
      setStep("Membaca file…");
      const mr = files.mr ? await readRows(files.mr) : null;
      const sp = files.sp ? await readRows(files.sp) : null;
      if (mr && !looksLikeMR(mr)) throw new Error('File Merchandise Report sepertinya bukan Merchandise Report (header "Brand Name" tidak ditemukan).');
      if (sp && looksLikeMR(sp)) throw new Error("File di Sales Person ternyata Merchandise Report. Cek lagi urutannya.");
      const body = JSON.stringify({ month, mr, sp });
      if (body.length > MAX_BODY) throw new Error(`Data terlalu besar (${kb(body.length)}). Import MR dan Sales Person satu per satu.`);
      setStep("Menulis ke Google Sheet… (bisa 10–40 detik)");
      const r = await fetch("/api/import-raw", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Import gagal (HTTP ${r.status})`);
      setMsg(j.message ?? "Selesai.");
      setState("ok");
      setFiles({ mr: null, sp: null });
      for (const k of ["mr", "sp"] as const) if (inputs[k].current) inputs[k].current!.value = "";
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
      setState("error");
    }
  };

  const busy = state === "busy";
  const ready = !!(files.mr || files.sp);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Tujuan: <b className="text-slate-700 dark:text-slate-200">{monthLabel}</b> · {sourceTitle} · tab <b>Control MR &amp;SP</b>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {SLOTS.map((s) => {
          const f = files[s.key];
          return (
            <div key={s.key} className={`relative rounded-2xl border-2 border-dashed p-4 transition ${f ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-slate-300 dark:border-slate-700"}`}>
              <label className="flex min-h-[72px] cursor-pointer items-center gap-3">
                <input
                  ref={inputs[s.key]}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => pick(s.key, e.target.files?.[0] ?? null)}
                />
                <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${f ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                  <FileSpreadsheet className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-950">{s.title}</span>
                  {f ? (
                    <span className="block truncate text-sm text-emerald-700 dark:text-emerald-400">{f.name} · {kb(f.size)}</span>
                  ) : (
                    <span className="block text-sm text-slate-500">Ketuk untuk pilih file .xls</span>
                  )}
                  <span className="block text-xs text-slate-400">{s.hint}</span>
                </span>
              </label>
              {f && !busy && (
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
        {busy ? step : "Import ke Google Sheet"}
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
