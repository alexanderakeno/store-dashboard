"use client";
import type { PdfText } from "@/lib/parsers/soh";

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
export function loadPdfJs(): Promise<PdfJs> {
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

/** All positioned text runs of a PDF (browser only). */
export async function readPdfTexts(file: File): Promise<PdfText[]> {
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
  return texts;
}
