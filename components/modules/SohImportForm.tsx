"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";
import { parseSohPdf, type PdfText, type SohParse } from "@/lib/parsers/soh";

/** pdf.js UMD build (window.pdfjsLib), loaded only on this page — same CDN as the Excel reader. */
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }> }> }>;
    }>;
  };
}

let pdfjs: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  const w = window as unknown as { pdfjsLib?: PdfJs };
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  pdfjs ??= new Promise<PdfJs>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${PDFJS}/pdf.min.js`;
    s.async = true;
    s.onload = () => {
      if (!w.pdfjsLib) return reject(new Error("Library pembaca PDF gagal dimuat"));
      w.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
      resolve(w.pdfjsLib);
    };
    s.onerror = () => {
      pdfjs = null;
      s.remove();
      reject(new Error("Library pembaca PDF gagal dimuat. Cek koneksi internet lalu coba lagi."));
    };
    document.head.appendChild(s);
  });
  return pdfjs;
}

async function readPdf(file: File): Promise<SohParse> {
  const lib = await loadPdfJs();
  const texts: PdfText[] = [];
  try {
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    for (let p = 1; p <= doc.numPages; p++) {
      const { items } = await (await doc.getPage(p)).getTextContent();
      for (const it of items) {
        if (typeof it.str !== "string" || !it.transform) continue;
        texts.push({ page: p, str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0, h: it.height ?? 0 });
      }
    }
  } catch (e) {
    throw new Error(`Gagal membaca ${file.name}: ${(e as Error).message}`);
  }
  return parseSohPdf(texts);
}

const num = (n: number) => n.toLocaleString("id-ID");
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function SohImportForm({ current }: { current: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<SohParse | null>(null);
  const [state, setState] = useState<"idle" | "reading" | "busy" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => void loadPdfJs().catch(() => {}));
  }, []);

  const pick = async (f: File | null) => {
    setFile(f);
    setParsed(null);
    setMsg("");
    if (!f) return setState("idle");
    setState("reading");
    try {
      const r = await readPdf(f);
      if (!r.items.length) throw new Error(r.warnings[0] ?? "Tidak ada artikel SOH terbaca di PDF ini.");
      setParsed(r);
      setState("idle");
    } catch (e) {
      setMsg((e as Error).message);
      setState("error");
    }
  };
  const clear = () => {
    void pick(null);
    if (input.current) input.current.value = "";
  };

  const run = async () => {
    if (!parsed) return;
    setState("busy");
    setMsg("");
    try {
      const body = JSON.stringify({ date: parsed.date, source: [parsed.title, file?.name].filter(Boolean).join(" · "), items: parsed.items });
      const r = await fetch("/api/soh", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Import gagal (HTTP ${r.status})`);
      setMsg(j.message ?? "Selesai.");
      setState("ok");
      setFile(null);
      setParsed(null);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
      setState("error");
    }
  };

  const busy = state === "busy";
  const bad = state === "error" && !!file && !parsed;
  const ok = !!parsed;
  const totalQty = parsed?.items.reduce((a, x) => a + x.qty, 0) ?? 0;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        PDF <b className="text-slate-700 dark:text-slate-200">Sales Dashboard V6</b> halaman <b>Stock On Hand</b> · menimpa SOH tersimpan
        {current ? <> (saat ini update {dmy(current)})</> : null} · tab <b>APP_SOH</b> di master sheet
      </p>

      <div className={`relative rounded-2xl border-2 border-dashed p-4 transition ${bad ? "border-rose-400 bg-rose-50/60 dark:bg-rose-950/20" : ok ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-slate-300 dark:border-slate-700"}`}>
        <label className="flex min-h-[72px] cursor-pointer items-center gap-3">
          <input ref={input} type="file" accept=".pdf,application/pdf" className="sr-only" disabled={busy} onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
          <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${bad ? "bg-rose-500 text-white" : ok ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
            {state === "reading" ? <Loader2 className="size-6 animate-spin" /> : <FileText className="size-6" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-slate-950">Stock On Hand (PDF)</span>
            {!file && <span className="block text-sm text-slate-500">Ketuk untuk pilih file .pdf</span>}
            {file && (
              <span className={`block truncate text-sm ${bad ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-400"}`}>
                {file.name}
                {state === "reading" ? " · membaca…" : ""}
                {parsed ? ` · ${parsed.items.length} artikel · qty ${num(totalQty)}${parsed.date ? ` · update ${dmy(parsed.date)}` : ""}` : ""}
              </span>
            )}
            {bad ? <span className="block text-xs font-semibold text-rose-700 dark:text-rose-300">{msg}</span> : <span className="block text-xs text-slate-400">Kolom per kategori: Article · Description · Qty</span>}
          </span>
        </label>
        {file && !busy && (
          <button type="button" onClick={clear} className="absolute top-2 right-2 grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-200/70" aria-label="Hapus file SOH">
            <X className="size-4" />
          </button>
        )}
      </div>

      {parsed && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {parsed.categories.map((c) => {
              const it = parsed.items.filter((x) => x.category === c);
              return (
                <span key={c} className="sd-badge slate">
                  {c} · {it.length} art · {num(it.reduce((a, x) => a + x.qty, 0))}
                </span>
              );
            })}
          </div>
          {parsed.warnings.map((w) => (
            <p key={w} className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5" /> {w}</p>
          ))}
        </div>
      )}

      <button type="button" className="sd-btn primary w-full justify-center !py-3 !text-base" onClick={run} disabled={!parsed || busy}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
        {busy ? "Menyimpan SOH…" : "Simpan SOH"}
      </button>

      {state === "ok" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" role="status">
          <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-4" /> SOH tersimpan</p>
          <p>{msg}</p>
        </div>
      )}
      {state === "error" && !bad && (
        <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{msg}</span>
        </div>
      )}
    </div>
  );
}
