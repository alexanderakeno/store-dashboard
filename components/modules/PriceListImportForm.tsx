"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Loader2, Upload, X } from "lucide-react";
import { parsePriceListPdf, type PriceListParse } from "@/lib/parsers/pricelist";
import { isApplePriceListPdf } from "@/lib/parsers/applePricelist";
import { isAndroidPriceListXlsx, parseAndroidPriceListXlsx, type Sheet } from "@/lib/parsers/androidXlsx";
import { loadPdfJs, readPdfTexts } from "./pdfText";
import { loadSheetJS } from "./ImportRawForm";
import { postJson } from "./postJson";

const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

type Fmt = "pdf" | "xlsx";
const ACCEPT: Record<Fmt, string> = { pdf: ".pdf,application/pdf", xlsx: ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" };

/** Every sheet of an Excel file as cell grids (browser only). */
async function readSheets(file: File): Promise<Sheet[]> {
  const XLSX = await loadSheetJS();
  try {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
    return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true }) as unknown[][] }));
  } catch (e) {
    throw new Error(`Gagal membaca ${file.name}: ${(e as Error).message}`);
  }
}

/**
 * Android price list: the PDF, or the DIGIPLUS Excel ("PRICE LIST PROMO DIGIPLUS … .xlsx" — per article, so stock is
 * matched by article code and the Price List shows only types in stock). Apple has its own 2-PDF form.
 */
export function PriceListImportForm({ current, storeCode = "" }: { current: string | null; storeCode?: string }) {
  const [fmt, setFmt] = useState<Fmt>("pdf");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<PriceListParse | null>(null);
  const [state, setState] = useState<"idle" | "reading" | "busy" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => void (fmt === "pdf" ? loadPdfJs() : loadSheetJS()).catch(() => {}));
  }, [fmt]);

  const pick = async (f: File | null) => {
    setFile(f);
    setParsed(null);
    setMsg("");
    if (!f) return setState("idle");
    setState("reading");
    try {
      if (/\.xlsx?$/i.test(f.name)) {
        setFmt("xlsx");
        const sheets = await readSheets(f);
        if (!isAndroidPriceListXlsx(sheets)) throw new Error('Bukan file price list DIGIPLUS (sheet "PRICE LIST DIGIPLUS NASIONAL" / "MASTER" tidak ada).');
        const r = parseAndroidPriceListXlsx(sheets, storeCode);
        if (!r.items.length) throw new Error(r.warnings[0] ?? "Tidak ada harga terbaca di file ini.");
        setParsed(r);
        setState("idle");
        return;
      }
      setFmt("pdf");
      const texts = await readPdfTexts(f);
      if (isApplePriceListPdf(texts)) throw new Error("Ini PDF price list Apple — upload di bagian Import Price List Apple (2 PDF).");
      const all = parsePriceListPdf(texts);
      // Apple prices come from the Apple PDFs only — rows recognised as Apple here are left out
      const apple = all.items.filter((x) => x.kind !== "android").length;
      const r: PriceListParse = { ...all, items: all.items.filter((x) => x.kind === "android"), kinds: ["android"], warnings: apple ? [...all.warnings, `${apple} baris Apple dilewati (price list Apple diimport terpisah).`] : all.warnings };
      if (!r.items.length) throw new Error(all.warnings[0] ?? "Tidak ada harga Android terbaca di PDF ini.");
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
      const r = await postJson("/api/pricelist", { kind: "android", date: parsed.date, source: [parsed.title, file?.name].filter(Boolean).join(" · "), items: parsed.items, qoala: parsed.qoala });
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
  const brands = parsed ? [...new Set(parsed.items.map((x) => x.brand))] : [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        {fmt === "pdf" ? (
          <>PDF <b className="text-slate-700 dark:text-slate-200">Price List Android</b> (kolom Normal Price · Promotion Price · Product Remarks).</>
        ) : (
          <>Excel <b className="text-slate-700 dark:text-slate-200">PRICE LIST PROMO DIGIPLUS</b> (sheet Nasional · per artikel){storeCode ? <> + promo khusus toko {storeCode}</> : null}. Price List hanya menampilkan tipe yang <b>ada stoknya</b> di SOH.</>
        )}{" "}
        Menimpa price list Android saja — Apple tidak berubah.
        {" "}Saat ini: Android {current ? dmy(current) : "belum ada"} · tab <b>APP_PriceList</b> di master sheet
      </p>

      <div className="inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800" role="radiogroup" aria-label="Jenis file price list Android">
        {(["pdf", "xlsx"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={fmt === k}
            disabled={busy}
            onClick={() => {
              if (fmt === k) return;
              setFmt(k);
              clear();
            }}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold ${fmt === k ? "bg-white text-slate-950 shadow-sm dark:bg-slate-600 dark:text-white" : "text-slate-500"}`}
          >
            {k === "pdf" ? <FileText className="size-4" /> : <FileSpreadsheet className="size-4" />}
            {k === "pdf" ? "PDF" : "Excel"}
          </button>
        ))}
      </div>

      <div className={`relative rounded-2xl border-2 border-dashed p-4 transition ${bad ? "border-rose-400 bg-rose-50/60 dark:bg-rose-950/20" : ok ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-slate-300 dark:border-slate-700"}`}>
        <label className="flex min-h-[72px] cursor-pointer items-center gap-3">
          <input ref={input} type="file" accept={ACCEPT[fmt]} className="sr-only" disabled={busy} onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
          <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${bad ? "bg-rose-500 text-white" : ok ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
            {state === "reading" ? <Loader2 className="size-6 animate-spin" /> : fmt === "pdf" ? <FileText className="size-6" /> : <FileSpreadsheet className="size-6" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-slate-950">Price List Android ({fmt === "pdf" ? "PDF" : "Excel"})</span>
            {!file && <span className="block text-sm text-slate-500">Ketuk untuk pilih file {fmt === "pdf" ? ".pdf" : ".xlsx"}</span>}
            {file && (
              <span className={`block truncate text-sm ${bad ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-400"}`}>
                {file.name}
                {state === "reading" ? " · membaca…" : ""}
                {parsed ? ` · ${parsed.items.length} tipe${fmt === "xlsx" ? ` · ${parsed.items.reduce((a, x) => a + (x.articles?.length ?? 0), 0)} artikel` : ""}${parsed.date ? ` · ${dmy(parsed.date)}` : ""}` : ""}
              </span>
            )}
            {bad ? <span className="block text-xs font-semibold text-rose-700 dark:text-rose-300">{msg}</span> : <span className="block text-xs text-slate-400">{fmt === "pdf" ? "Tipe · harga normal · harga promo · status (ACTIVE/EOL) · tabel Qoala" : "Artikel · tipe · harga original · harga current · promo & free gift · status"}</span>}
          </span>
        </label>
        {file && !busy && (
          <button type="button" onClick={clear} className="absolute top-2 right-2 grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-200/70" aria-label="Hapus file price list">
            <X className="size-4" />
          </button>
        )}
      </div>

      {parsed && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {brands.map((b) => (
              <span key={b} className="sd-badge slate">{b} · {parsed.items.filter((x) => x.brand === b).length}</span>
            ))}
            {parsed.qoala.length > 0 && <span className="sd-badge blue">Qoala · {parsed.qoala.length} tier</span>}
          </div>
          {parsed.warnings.map((w) => (
            <p key={w} className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5 shrink-0" /> {w}</p>
          ))}
        </div>
      )}

      <button type="button" className="sd-btn primary w-full justify-center !py-3 !text-base" onClick={run} disabled={!parsed || busy}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
        {busy ? "Menyimpan price list Android…" : "Simpan Price List Android"}
      </button>

      {state === "ok" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" role="status">
          <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-4" /> Price list Android tersimpan</p>
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
