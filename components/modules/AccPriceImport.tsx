"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { isAccPriceListXlsx, parseAccPriceListXlsx } from "@/lib/parsers/accPricelist";
import { readSheets } from "./PriceListImportForm";
import { postJson } from "./postJson";

const ACCEPT = ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Read → check → save in one go: the file is the confirmation (it replaces the whole accessories list). */
async function importFile(f: File): Promise<{ message: string; warnings: string[] }> {
  if (!/\.xlsx?$/i.test(f.name)) throw new Error("Pilih file Excel (.xlsx) price list aksesoris.");
  const sheets = await readSheets(f);
  if (!isAccPriceListXlsx(sheets)) throw new Error("Bukan file price list aksesoris (kolom SAP Article · SAP Description · Repricing Cash tidak ada).");
  const p = parseAccPriceListXlsx(sheets);
  if (!p.items.length) throw new Error(p.warnings[0] ?? "Tidak ada harga terbaca di file ini.");
  const r = await postJson("/api/pricelist/accessories", { date: p.date, source: [p.title, f.name].filter(Boolean).join(" · "), items: p.items });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Import gagal (HTTP ${r.status})`);
  return { message: j.message ?? `${p.items.length} artikel tersimpan.`, warnings: p.warnings };
}

/**
 * Accessories price list import. `compact` = the shortcut button on Price List › Aksesoris (pick the file and it is
 * saved straight away); otherwise the full panel on Data Upload.
 */
export function AccPriceImport({ current, compact = false }: { current?: string | null; compact?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [warn, setWarn] = useState<string[]>([]);

  const pick = async (f: File | null) => {
    if (input.current) input.current.value = "";
    if (!f) return;
    setState("busy");
    setMsg(`Membaca ${f.name}…`);
    setWarn([]);
    try {
      const r = await importFile(f);
      setMsg(r.message);
      setWarn(r.warnings);
      setState("ok");
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
      setState("error");
    }
  };

  const busy = state === "busy";
  const fileInput = <input ref={input} type="file" accept={ACCEPT} className="sr-only" disabled={busy} onChange={(e) => void pick(e.target.files?.[0] ?? null)} aria-label="File price list aksesoris" />;
  const result =
    state === "ok" ? (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" role="status">
        <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-4 shrink-0" /> {msg}</p>
        {warn.map((w) => <p key={w} className="mt-1 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5 shrink-0" /> {w}</p>)}
      </div>
    ) : state === "error" ? (
      <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{msg}</span>
      </div>
    ) : null;

  if (compact)
    return (
      <div className="flex flex-col items-end gap-2">
        <label className={`sd-btn primary cursor-pointer ${busy ? "pointer-events-none opacity-70" : ""}`}>
          {fileInput}
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {busy ? "Mengimport…" : "Import Price List Aksesoris"}
        </label>
        {result && <div className="w-full max-w-md">{result}</div>}
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Excel <b className="text-slate-700 dark:text-slate-200">digiplus Price List Accessories</b> (SAP Article · Reference SRP · Current SRP Cash · Repricing Cash · Remarks). Harga jual = Repricing Cash, dicocokkan ke stok aksesoris di SOH per artikel. Menimpa price list aksesoris saja.
        {" "}Saat ini: {current ? dmy(current) : "belum ada"} · tab <b>APP_AccPrice</b> di master sheet
      </p>
      <label className={`flex min-h-[72px] cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed p-4 ${state === "error" ? "border-rose-400" : state === "ok" ? "border-emerald-400" : "border-slate-300 dark:border-slate-700"} ${busy ? "pointer-events-none opacity-70" : ""}`}>
        {fileInput}
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800">{busy ? <Loader2 className="size-6 animate-spin" /> : <FileSpreadsheet className="size-6" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-950">Price List Aksesoris (Excel)</span>
          <span className="block text-sm text-slate-500">{busy ? msg : "Ketuk untuk pilih file .xlsx — langsung tersimpan"}</span>
        </span>
      </label>
      {result}
    </div>
  );
}
