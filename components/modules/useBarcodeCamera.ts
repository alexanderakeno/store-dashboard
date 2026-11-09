"use client";
import { useEffect, useRef, useState } from "react";

const ZXING_URL = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

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

/**
 * Back camera + barcode reading into `video`: native BarcodeDetector (Chrome Android), ZXing otherwise (iPhone).
 * `onCode` gets every read while `paused.current` is false; the same code is read again only after it was out of view for `cooldownMs`.
 * The camera stops when the component unmounts.
 */
export function useBarcodeCamera(onCode: (code: string) => void, opts: { cooldownMs?: number } = {}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const paused = useRef(false);
  const cb = useRef(onCode);
  cb.current = onCode;
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const [torch, setTorch] = useState<boolean | null>(null);
  const cooldown = opts.cooldownMs ?? 0;

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let reader: ZXingReader | null = null;
    let last = { code: "", at: 0 };
    const emit = (code: string) => {
      if (paused.current || !code) return;
      const now = Date.now();
      // the same code again counts only after it has been out of view for `cooldown` (holding an item still ≠ +1 per second)
      if (code === last.code && now - last.at < cooldown) {
        last.at = now;
        return;
      }
      last = { code, at: now };
      cb.current(code);
    };
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
                if (codes[0]?.rawValue) emit(codes[0].rawValue);
              } catch {}
            }
            timer = setTimeout(tick, 160);
          };
          void tick();
        } else {
          const Z = await loadZXing();
          if (stop) return;
          reader = new Z.BrowserMultiFormatReader();
          await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video.current!, (res) => {
            if (res) emit(res.getText());
          });
          stream.current = (video.current?.srcObject as MediaStream) ?? null;
          setStarting(false);
        }
      } catch (e) {
        const err = e as Error & { name?: string };
        setError(err.name === "NotAllowedError" ? "Izin kamera ditolak. Aktifkan izin kamera untuk situs ini di pengaturan browser, atau ketik kodenya." : err.name === "NotFoundError" ? "Kamera tidak ditemukan. Ketik kodenya." : err.message || "Kamera tidak bisa dibuka.");
        setStarting(false);
      }
    })();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      reader?.reset();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [cooldown]);

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

  return { video, paused, error, starting, torch, toggleTorch };
}
