"use client";
/** Excel reading in the browser (SheetJS from the CDN, loaded on first use) for every import form. */
type Row = Array<string | number | boolean | null>;
type Rows = Row[];

/** Same SheetJS build as the Apps Script dialog (ImportDialog.html), loaded only when a file is picked. */
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
