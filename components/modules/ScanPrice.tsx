"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Check, History, Keyboard, Loader2, ScanLine, X, Zap } from "lucide-react";
import type { ScanHit } from "@/lib/domain/scan";

type Hit = ScanHit & { sold: number | null };
type Result = { state: "idle" } | { state: "loading"; code: string } | { state: "hit"; hit: Hit } | { state: "miss"; code: string } | { state: "error"; msg: string };

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const rp = (n: number) => `Rp ${nf.format(Math.round(n))}`;
const ZXING_URL = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];
const HISTORY_KEY = "sd-scan-history";

type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type ZXingReader = { decodeFromConstraints: (c: MediaStreamConstraints, v: HTMLVideoElement, cb: (r: { getText: () => string } | null) => void) => Promise<unknown>; reset: () => void };
type ZXingNS = { BrowserMultiFormatReader: new () => ZXingReader };

let zxing: Promise<ZXingNS> | null = null;
function loadZXing(): Promise<ZXingNS> {
  const w = window as unknown as { ZXing?: ZXingNS };
  if (w.ZXing) return Promise.resolve(w.ZXing);
  zxing ??= new Promise<ZXingNS>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = ZXING_URL;
    s.async = true;
    s.onload = () => (w.ZXing ? resolve(w.ZXing) : reject(new Error("Pembaca barcode gagal dimuat")));
    s.onerror = () => {
      zxing = null;
      reject(new Error("Pembaca barcode gagal dimuat — cek koneksi"));
    };
    document.head.appendChild(s);
  });
  return zxing;
}

async function nativeDetector(): Promise<Detector | null> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const sup = (await BD.getSupportedFormats?.()) ?? FORMATS;
    const formats = FORMATS.filter((f) => sup.includes(f));
    return formats.includes("ean_13") ? new BD({ formats }) : null;
  } catch {
    return null;
  }
}

function readHistory(): Array<{ code: string; description: string; price: number | null }> {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]").slice(0, 8);
  } catch {
    return [];
  }
}

/**
 * "Scan Harga" (phones only): a floating button that opens the back camera, reads the barcode on the box and shows
 * the price (accessories list / Android & Apple price list / SOH price), SRP, promo remark and stock.
 * Native BarcodeDetector where the browser has it (Chrome Android), ZXing otherwise (iPhone Safari).
 */
export function ScanPrice() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex h-14 items-center gap-2 rounded-full bg-blue-600 px-5 text-[15px] font-extrabold text-white shadow-[0_10px_24px_rgba(37,99,235,.45)] active:scale-95 md:hidden print:hidden" aria-label="Scan harga barang">
        <ScanLine className="size-5" /> Scan Harga
      </button>
      {open && <ScanOverlay onClose={() => setOpen(false)} />}
    </>
  );
}

function ScanOverlay({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const reader = useRef<ZXingReader | null>(null);
  const busy = useRef(false);
  const paused = useRef(false);
  const [camError, setCamError] = useState("");
  const [starting, setStarting] = useState(true);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [result, setResult] = useState<Result>({ state: "idle" });
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [history, setHistory] = useState(readHistory);
  const [showHistory, setShowHistory] = useState(false);

  const lookup = useCallback(async (code: string) => {
    const c = code.trim();
    if (!c || busy.current) return;
    busy.current = true;
    paused.current = true;
    navigator.vibrate?.(60);
    setResult({ state: "loading", code: c });
    try {
      const r = await fetch(`/api/scan?code=${encodeURIComponent(c)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Gagal (HTTP ${r.status})`);
      if (!j.hit) setResult({ state: "miss", code: c });
      else {
        const hit = j.hit as Hit;
        setResult({ state: "hit", hit });
        setHistory((h) => {
          const next = [{ code: c, description: hit.description, price: hit.price }, ...h.filter((x) => x.code !== c)].slice(0, 8);
          try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
      }
    } catch (e) {
      setResult({ state: "error", msg: (e as Error).message });
    } finally {
      busy.current = false;
    }
  }, []);

  const again = () => {
    setResult({ state: "idle" });
    setTyping(false);
    setShowHistory(false);
    paused.current = false;
  };

  // camera + decoder; stopped on close
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    document.documentElement.style.overflow = "hidden";
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Browser ini tidak bisa membuka kamera. Pakai Chrome / Safari terbaru, atau ketik kodenya.");
        const det = await nativeDetector();
        if (det) {
          const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
          if (stop) return s.getTracks().forEach((t) => t.stop());
          stream.current = s;
          const v = video.current!;
          v.srcObject = s;
          await v.play();
          const caps = (s.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { torch?: boolean };
          setTorch(caps.torch ? false : null);
          setStarting(false);
          const tick = async () => {
            if (stop) return;
            if (!paused.current && v.readyState >= 2) {
              try {
                const codes = await det.detect(v);
                if (codes[0]?.rawValue) void lookup(codes[0].rawValue);
              } catch {}
            }
            timer = setTimeout(tick, 180);
          };
          void tick();
        } else {
          const Z = await loadZXing();
          if (stop) return;
          const r = new Z.BrowserMultiFormatReader();
          reader.current = r;
          await r.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video.current!, (res) => {
            if (res && !paused.current) void lookup(res.getText());
          });
          stream.current = (video.current?.srcObject as MediaStream) ?? null;
          setStarting(false);
        }
      } catch (e) {
        const err = e as Error & { name?: string };
        setCamError(err.name === "NotAllowedError" ? "Izin kamera ditolak. Aktifkan izin kamera untuk situs ini di pengaturan browser, atau ketik kodenya." : err.name === "NotFoundError" ? "Kamera tidak ditemukan. Ketik kodenya di bawah." : err.message || "Kamera tidak bisa dibuka.");
        setStarting(false);
        setTyping(true);
      }
    })();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      reader.current?.reset();
      stream.current?.getTracks().forEach((t) => t.stop());
      document.documentElement.style.overflow = "";
    };
  }, [lookup]);

  const toggleTorch = async () => {
    const t = stream.current?.getVideoTracks()[0];
    if (!t || torch === null) return;
    try {
      await t.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const sheet = result.state !== "idle" || typing || showHistory;

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white" role="dialog" aria-modal="true" aria-label="Scan harga">
      <video ref={video} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
      {/* frame */}
      {!camError && (
        <div className="pointer-events-none absolute inset-x-10 top-[28%] h-36 rounded-2xl">
          <i className="absolute -top-0.5 -left-0.5 size-8 rounded-tl-2xl border-t-4 border-l-4 border-white" />
          <i className="absolute -top-0.5 -right-0.5 size-8 rounded-tr-2xl border-t-4 border-r-4 border-white" />
          <i className="absolute -bottom-0.5 -left-0.5 size-8 rounded-bl-2xl border-b-4 border-l-4 border-white" />
          <i className="absolute -right-0.5 -bottom-0.5 size-8 rounded-br-2xl border-r-4 border-b-4 border-white" />
          {!sheet && <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-rose-500 shadow-[0_0_12px_#ef4444]" />}
        </div>
      )}
      <div className="absolute inset-x-0 top-0 flex justify-between p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 rounded-full bg-black/55 px-4 py-2 text-sm font-bold"><X className="size-4" /> Tutup</button>
        {torch !== null && <button type="button" onClick={toggleTorch} className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold ${torch ? "bg-amber-400 text-black" : "bg-black/55"}`}><Zap className="size-4" /> Senter</button>}
      </div>
      {!sheet && (
        <p className="absolute inset-x-0 top-[calc(28%+10rem)] text-center text-sm font-bold drop-shadow">{starting ? "Membuka kamera…" : camError || "Arahkan ke barcode di kemasan"}</p>
      )}
      {camError && !sheet && <p className="absolute inset-x-6 top-1/3 text-center text-sm font-semibold">{camError}</p>}
      {!sheet && (
        <div className="absolute inset-x-4 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] flex gap-2.5">
          <button type="button" onClick={() => ((paused.current = true), setTyping(true))} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/15 py-3 text-sm font-bold backdrop-blur"><Keyboard className="size-4" /> Ketik kode</button>
          <button type="button" onClick={() => ((paused.current = true), setShowHistory(true))} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/15 py-3 text-sm font-bold backdrop-blur"><History className="size-4" /> Riwayat</button>
        </div>
      )}

      {sheet && (
        <div className="absolute inset-x-0 bottom-0 max-h-[78%] overflow-y-auto rounded-t-[26px] bg-white px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-slate-950 shadow-[0_-10px_30px_rgba(0,0,0,.35)] dark:bg-slate-900 dark:text-white">
          <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-slate-300" />
          {typing && result.state === "idle" && (
            <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), void lookup(typed))}>
              <p className="font-extrabold">Ketik barcode atau kode artikel</p>
              {camError && <p className="text-xs font-semibold text-amber-700">{camError}</p>}
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="text" autoCapitalize="characters" className="sd-input w-full" placeholder="mis. 8886463690277 atau APPMD3J4ZA/A" />
              <div className="flex gap-2.5">
                <button type="submit" className="sd-btn primary flex-1 justify-center !py-3" disabled={typed.trim().length < 4}>Cari harga</button>
                {!camError && <button type="button" className="sd-btn flex-1 justify-center !py-3" onClick={again}>Kembali scan</button>}
              </div>
            </form>
          )}
          {showHistory && result.state === "idle" && (
            <div>
              <p className="mb-2 text-[11px] font-black tracking-[.1em] text-slate-500 uppercase">Baru discan</p>
              {history.length ? (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.map((h) => (
                    <li key={h.code}><button type="button" onClick={() => void lookup(h.code)} className="flex w-full justify-between gap-3 py-2.5 text-left text-sm"><span className="min-w-0 truncate">{h.description}</span><b className="shrink-0">{h.price != null ? rp(h.price) : "–"}</b></button></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">Belum ada.</p>}
              <button type="button" className="sd-btn mt-3 w-full justify-center !py-3" onClick={again}>Kembali scan</button>
            </div>
          )}
          {result.state === "loading" && <p className="flex items-center gap-2 py-6 font-bold"><Loader2 className="size-5 animate-spin" /> Mencari {result.code}…</p>}
          {(result.state === "miss" || result.state === "error") && (
            <div className="space-y-3 py-2">
              <p className="font-extrabold">{result.state === "miss" ? "Barang tidak ditemukan" : "Gagal mencari"}</p>
              <p className="text-sm text-slate-500">{result.state === "miss" ? <>Kode <b className="font-mono">{result.code}</b> tidak ada di SOH maupun price list aksesoris. Coba ketik kode artikelnya.</> : result.msg}</p>
              <div className="flex gap-2.5">
                <button type="button" className="sd-btn primary flex-1 justify-center !py-3" onClick={again}><ScanLine className="size-4" /> Scan lagi</button>
                <button type="button" className="sd-btn flex-1 justify-center !py-3" onClick={() => (setResult({ state: "idle" }), setTyping(true))}>Ketik kode</button>
              </div>
            </div>
          )}
          {result.state === "hit" && <HitCard hit={result.hit} onAgain={again} onClose={onClose} history={history} />}
        </div>
      )}
    </div>
  );
}

function HitCard({ hit, onAgain, onClose, history }: { hit: Hit; onAgain: () => void; onClose: () => void; history: Array<{ code: string; description: string; price: number | null }> }) {
  const below = hit.price != null && hit.normal != null && hit.normal > hit.price;
  const moved = hit.price != null && hit.current != null && hit.current !== hit.price && !(below && hit.current === hit.normal);
  const save = below ? Math.round((1 - hit.price! / hit.normal!) * 100) : 0;
  const detail = hit.src === "acc" ? "/pricelist?k=acc" : `/soh?s=${encodeURIComponent(hit.article)}`;
  return (
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><Check className="size-3.5" /> Terbaca · {hit.code}</span>
      <p className="mt-2.5 text-lg leading-snug font-black">{hit.description}</p>
      <p className="text-xs text-slate-500">{[hit.brand, hit.category].filter(Boolean).join(" · ")} · <span className="font-mono">{hit.article}</span></p>
      {hit.price != null ? (
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
          <span className="text-3xl font-black tabular-nums">{rp(hit.price)}</span>
          {below && <span className="text-base font-bold text-slate-400 tabular-nums line-through">{rp(hit.normal!)}</span>}
        </p>
      ) : <p className="mt-3 text-lg font-bold text-slate-400">Belum ada harga</p>}
      <div className="mt-1 flex flex-wrap gap-1.5">
        {hit.remark && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-extrabold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{hit.remark}</span>}
        {moved && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${hit.price! < hit.current! ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{hit.price! < hit.current! ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />} dari {rp(hit.current!)} · ganti label</span>}
        {hit.src === "soh" && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-extrabold text-amber-700">Harga dari SOH (tidak ada di price list)</span>}
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-slate-50 p-2.5 dark:bg-slate-800"><p className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Stok</p><p className={`text-lg font-black ${hit.qty === 0 || hit.qty == null ? "text-rose-600" : ""}`}>{hit.qty ?? 0}</p></div>
        <div className="rounded-2xl bg-slate-50 p-2.5 dark:bg-slate-800"><p className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Terjual</p><p className="text-lg font-black">{hit.sold ?? "–"}</p></div>
        <div className="rounded-2xl bg-slate-50 p-2.5 dark:bg-slate-800"><p className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Hemat</p><p className="text-lg font-black">{save ? `${save}%` : "–"}</p></div>
      </div>
      <div className="mt-3.5 flex gap-2.5">
        <button type="button" className="sd-btn primary flex-1 justify-center !py-3" onClick={onAgain}><ScanLine className="size-4" /> Scan lagi</button>
        <Link href={detail} prefetch={false} onClick={onClose} className="sd-btn flex-1 justify-center !py-3">Lihat detail</Link>
      </div>
      {history.length > 1 && (
        <div className="mt-3.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
          <p className="text-[10px] font-black tracking-[.1em] text-slate-500 uppercase">Baru discan</p>
          {history.slice(1, 4).map((h) => <p key={h.code} className="flex justify-between gap-3 py-1 text-xs"><span className="min-w-0 truncate">{h.description}</span><b className="shrink-0">{h.price != null ? rp(h.price) : "–"}</b></p>)}
        </div>
      )}
    </div>
  );
}
