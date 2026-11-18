"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { barcodeOf } from "@/lib/barcode";

/** What the popup needs of an SOH row. */
export interface BarcodeRow {
  article: string;
  description: string;
  qty: number;
  barcodes?: string[];
}

export const BARCODE_POPOVER = "soh-barcode";

/** Small barcode icon (stripes), drawn so it reads as "barcode" at 14px. */
export function BarcodeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 14" className={className} aria-hidden fill="currentColor">
      {[0, 2.5, 4, 6.5, 8, 9.5, 12, 13.5, 16, 18.5].map((x, i) => <rect key={x} x={x} y={0} width={[1.5, 1, 2, 1, 1, 2, 1, 2, 1.5, 1.5][i]} height={14} />)}
    </svg>
  );
}

/** Linear barcode as SVG: bars stretch to the box width, modules stay equal. */
function Bars({ value }: { value: string }) {
  const b = barcodeOf(value);
  const q = 10; // quiet zone in modules
  const w = b.bits.length + 2 * q;
  const runs: Array<[number, number]> = [];
  for (let i = 0; i < b.bits.length; i++) {
    if (b.bits[i] !== "1") continue;
    let j = i;
    while (b.bits[j + 1] === "1") j++;
    runs.push([i, j - i + 1]);
    i = j;
  }
  const tall = (x: number) => b.guards.some(([a, z]) => x >= a && x < z);
  return (
    <figure className="rounded-xl bg-white px-1 pt-3 pb-2" aria-label={`Barcode ${b.format} ${b.text}`}>
      <svg viewBox={`0 0 ${w} 60`} preserveAspectRatio="none" className="block h-28 w-full sm:h-32" shapeRendering="crispEdges">
        <rect width={w} height={60} fill="#fff" />
        {runs.map(([x, n]) => <rect key={x} x={x + q} y={0} width={n} height={tall(x) ? 60 : 54} fill="#000" />)}
      </svg>
      <figcaption className="mt-1 text-center font-mono text-[15px] font-bold tracking-[0.18em] text-black">{b.text}</figcaption>
    </figure>
  );
}

/**
 * SOH "Barcode": a big linear barcode of one SOH type (its EAN / UPC from the SOH Excel, or its article code as
 * Code 128) to scan from the screen; previous / next walk the list shown on the page.
 */
export function BarcodePopup({ list, index, onIndex, onClose }: { list: BarcodeRow[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const row = list[index];
  const codes = row ? [...(row.barcodes ?? []), row.article] : [];
  const [pick, setPick] = useState(0);
  const value = codes[Math.min(pick, codes.length - 1)] ?? "";
  // another type: back to its first barcode
  useEffect(() => setPick(0), [row?.article]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!row) return;
      if (e.key === "ArrowRight" && index < list.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, index, list.length, onIndex]);
  return (
    <div
      id={BARCODE_POPOVER}
      popover="auto"
      onToggle={(e) => (e as unknown as { newState: string }).newState === "closed" && onClose()}
      className="m-auto mb-0 max-h-[94dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-200 bg-white p-4 text-left text-slate-900 shadow-2xl backdrop:bg-slate-900/50 sm:mb-auto sm:w-[min(94vw,560px)] sm:rounded-3xl sm:p-5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      {row && (
        <>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base leading-tight font-black">{row.description || row.article}</p>
              <p className="mt-1 text-xs text-slate-500">
                <span className="font-mono">{row.article}</span> · SOH <b className="text-slate-700 dark:text-slate-200">{row.qty}</b> · {index + 1}/{list.length}
              </p>
            </div>
            <button type="button" popoverTarget={BARCODE_POPOVER} popoverTargetAction="hide" className="sd-btn shrink-0" aria-label="Tutup"><X className="size-4" /></button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-600">
            <Bars value={value} />
          </div>
          {codes.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pilih barcode">
              {codes.map((c, i) => (
                <button key={c + i} type="button" role="radio" aria-checked={i === pick} onClick={() => setPick(i)} className={`rounded-lg border px-2.5 py-1 font-mono text-[12px] font-bold ${i === pick ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900" : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}`}>
                  {i === codes.length - 1 ? "Kode artikel" : c}
                </button>
              ))}
            </div>
          )}
          <p className="mt-2.5 text-[11px] leading-snug text-slate-500">
            {row.barcodes?.length ? "Barcode dari SOH Excel." : "Tidak ada barcode di SOH — yang tampil kode artikel (Code 128)."} Naikkan kecerahan layar kalau scanner sulit membaca; di HP, putar ke samping untuk barcode lebih besar.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="sd-btn justify-center" disabled={index === 0} onClick={() => onIndex(index - 1)}><ChevronLeft className="size-4" /> Sebelumnya</button>
            <button type="button" className="sd-btn dark justify-center" disabled={index >= list.length - 1} onClick={() => onIndex(index + 1)}>Berikutnya <ChevronRight className="size-4" /></button>
          </div>
        </>
      )}
    </div>
  );
}
