"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Loader2, Upload, X } from "lucide-react";
import { isApplePriceListPdf, mergeApple, parseApplePriceListPdf } from "@/lib/parsers/applePricelist";
import { isApplePriceListXlsx, parseApplePriceListXlsx } from "@/lib/parsers/appleXlsx";
import type { PriceListParse } from "@/lib/parsers/pricelist";
import { loadSheetJS } from "./ImportRawForm";
import { loadPdfJs, readPdfTexts } from "./pdfText";
import { postJson } from "./postJson";
import { readSheets } from "./PriceListImportForm";

type Fmt = "pdf" | "xlsx";
const ACCEPT: Record<Fmt, string> = { pdf: ".pdf,application/pdf", xlsx: ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" };

const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

type SlotState = { file: File | null; parsed: PriceListParse | null; state: "idle" | "reading" | "error"; msg: string };
const EMPTY: SlotState = { file: null, parsed: null, state: "idle", msg: "" };

/** One drop zone of the Apple import: PDF 1 / PDF 2, or the single Excel file. */
function Slot({ n, fmt, slot, disabled, onPick }: { n: number; fmt: Fmt; slot: SlotState; disabled: boolean; onPick: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const bad = slot.state === "error";
  const ok = !!slot.parsed;
  const cats = slot.parsed ? [...new Set(slot.parsed.items.map((x) => x.brand))] : [];
  useEffect(() => {
    if (!slot.file && input.current) input.current.value = "";
  }, [slot.file]);
  return (
    <div className={`relative rounded-2xl border-2 border-dashed p-4 transition ${bad ? "border-rose-400 bg-rose-50/60 dark:bg-rose-950/20" : ok ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-slate-300 dark:border-slate-700"}`}>
      <label className="flex min-h-[72px] cursor-pointer items-center gap-3">
        <input ref={input} type="file" accept={ACCEPT[fmt]} className="sr-only" disabled={disabled} onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
        <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${bad ? "bg-rose-500 text-white" : ok ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
          {slot.state === "reading" ? <Loader2 className="size-6 animate-spin" /> : fmt === "pdf" ? <FileText className="size-6" /> : <FileSpreadsheet className="size-6" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-950">Price List Apple · {fmt === "pdf" ? `PDF ${n}` : "Excel"}</span>
          {!slot.file && <span className="block text-sm text-slate-500">Ketuk untuk pilih file {fmt === "pdf" ? ".pdf" : ".xlsx"}</span>}
          {slot.file && (
            <span className={`block truncate text-sm ${bad ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-400"}`}>
              {slot.file.name}
              {slot.state === "reading" ? " · membaca…" : ""}
              {slot.parsed ? ` · ${slot.parsed.items.length} tipe${fmt === "xlsx" ? ` · ${slot.parsed.items.reduce((a, x) => a + (x.articles?.length ?? 0), 0)} artikel` : ""}${slot.parsed.date ? ` · ${dmy(slot.parsed.date)}` : ""}` : ""}
            </span>
          )}
          {bad ? (
            <span className="block text-xs font-semibold text-rose-700 dark:text-rose-300">{slot.msg}</span>
          ) : (
            <span className="block text-xs text-slate-400">{cats.length ? cats.join(" · ") : fmt === "xlsx" ? "Sheet PRICE LIST APPLE DEVICE · SAP Article · Normal · Promotion Price" : n === 1 ? "mis. Mac · Watch · iPad Air" : "mis. iPad mini/Pro · iPhone · Qoala"}</span>
          )}
        </span>
      </label>
      {slot.file && !disabled && (
        <button type="button" onClick={() => onPick(null)} className="absolute top-2 right-2 grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-200/70" aria-label={fmt === "pdf" ? `Hapus PDF ${n}` : "Hapus file Excel"}>
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function ApplePriceListImportForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [fmt, setFmt] = useState<Fmt>("pdf");
  const [slots, setSlots] = useState<[SlotState, SlotState]>([EMPTY, EMPTY]);
  const [state, setState] = useState<"idle" | "busy" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => void (fmt === "pdf" ? loadPdfJs() : loadSheetJS()).catch(() => {}));
  }, [fmt]);

  const set = (i: 0 | 1, s: SlotState) => setSlots((prev) => (i === 0 ? [s, prev[1]] : [prev[0], s]));

  const pick = async (i: 0 | 1, f: File | null) => {
    setMsg("");
    if (state !== "busy") setState("idle");
    if (!f) return set(i, EMPTY);
    set(i, { file: f, parsed: null, state: "reading", msg: "" });
    try {
      if (/\.xlsx?$/i.test(f.name)) {
        // an Excel file picked in PDF mode switches to Excel (one file holds the whole Apple price list)
        if (fmt !== "xlsx") {
          setFmt("xlsx");
          setSlots([EMPTY, EMPTY]);
          i = 0;
          set(0, { file: f, parsed: null, state: "reading", msg: "" });
        }
        const sheets = await readSheets(f);
        if (!isApplePriceListXlsx(sheets)) throw new Error("Bukan Excel price list Apple (kolom SAP Article · SAPDescription · Normal Price · Promotion Price dengan kategori Apple Device tidak ditemukan). Excel Android → upload di bagian Android.");
        const r = parseApplePriceListXlsx(sheets);
        if (!r.items.length) throw new Error(r.warnings[0] ?? "Tidak ada harga terbaca di Excel ini.");
        return set(i, { file: f, parsed: r, state: "idle", msg: "" });
      }
      if (fmt !== "pdf") {
        setFmt("pdf");
        setSlots([EMPTY, EMPTY]);
      }
      const texts = await readPdfTexts(f);
      if (!isApplePriceListPdf(texts)) throw new Error("Bukan PDF price list Apple (kolom Description · Normal · Cicilan · Cash tidak ditemukan). PDF Android → upload di bagian Android.");
      const r = parseApplePriceListPdf(texts);
      if (!r.items.length) throw new Error(r.warnings[0] ?? "Tidak ada harga terbaca di PDF ini.");
      set(i, { file: f, parsed: r, state: "idle", msg: "" });
    } catch (e) {
      set(i, { file: f, parsed: null, state: "error", msg: (e as Error).message });
    }
  };

  const [a, b] = slots;
  const excel = fmt === "xlsx";
  const same = !excel && !!a.parsed && !!b.parsed && a.parsed.items.length === b.parsed.items.length && a.parsed.items.every((x, k) => x.name === b.parsed!.items[k].name && x.normal === b.parsed!.items[k].normal);
  const ready = excel ? !!a.parsed : !!a.parsed && !!b.parsed && !same;
  const merged = excel ? a.parsed : a.parsed && b.parsed ? mergeApple([a.parsed, b.parsed]) : null;
  const busy = state === "busy";

  const run = async () => {
    if (!merged || !ready) return;
    setState("busy");
    setMsg("");
    try {
      const source = [merged.title, a.file?.name, excel ? null : b.file?.name].filter(Boolean).join(" · ");
      const r = await postJson("/api/pricelist", { kind: "apple", date: merged.date, source, items: merged.items, qoala: merged.qoala });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Import gagal (HTTP ${r.status})`);
      setMsg(j.message ?? "Selesai.");
      setState("ok");
      setSlots([EMPTY, EMPTY]);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
      setState("error");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        {excel ? (
          <>Excel <b className="text-slate-700 dark:text-slate-200">Price List DIGIMAP</b> (1 file, per artikel/warna) — stok dicocokkan per kode artikel, jadi Price List hanya menampilkan tipe yang ada stoknya. Excel tidak punya harga cicilan & tabel Qoala: Qoala tersimpan tetap dipakai. Menimpa price list Apple saja, Android tidak berubah.</>
        ) : (
          <>PDF <b className="text-slate-700 dark:text-slate-200">Price List Apple</b> selalu 2 file (kolom Normal Price · Promotion Cicilan · Promotion Cash). Pilih keduanya — disimpan bersama dan menimpa price list Apple saja, Android tidak berubah.</>
        )}
        {" "}Saat ini: Apple {current ? dmy(current) : "belum ada"} · tab <b>APP_PriceList</b> di master sheet
      </p>

      <div className="inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800" role="radiogroup" aria-label="Jenis file price list Apple">
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
              setSlots([EMPTY, EMPTY]);
              setMsg("");
              setState("idle");
            }}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold ${fmt === k ? "bg-white text-slate-950 shadow-sm dark:bg-slate-600 dark:text-white" : "text-slate-500"}`}
          >
            {k === "pdf" ? <FileText className="size-4" /> : <FileSpreadsheet className="size-4" />}
            {k === "pdf" ? "PDF (2 file)" : "Excel"}
          </button>
        ))}
      </div>

      {excel ? (
        <Slot n={1} fmt="xlsx" slot={a} disabled={busy} onPick={(f) => void pick(0, f)} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Slot n={1} fmt="pdf" slot={a} disabled={busy} onPick={(f) => void pick(0, f)} />
          <Slot n={2} fmt="pdf" slot={b} disabled={busy} onPick={(f) => void pick(1, f)} />
        </div>
      )}

      {same && <p className="flex items-center gap-2 text-xs font-semibold text-rose-700 dark:text-rose-300"><AlertTriangle className="size-3.5 shrink-0" /> PDF 1 dan PDF 2 isinya sama — pilih file yang satunya lagi.</p>}
      {!excel && !same && (a.parsed || b.parsed) && !ready && <p className="text-xs text-slate-500">Pilih juga PDF {a.parsed ? 2 : 1} supaya price list Apple lengkap.</p>}

      {merged && ready && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {[...new Set(merged.items.map((x) => x.brand))].map((c) => (
              <span key={c} className="sd-badge slate">{c} · {merged.items.filter((x) => x.brand === c).length}</span>
            ))}
            {merged.qoala.length > 0 && <span className="sd-badge blue">Qoala · {merged.qoala.length} tier</span>}
            {merged.date && <span className="sd-badge green">{dmy(merged.date)}</span>}
          </div>
          {merged.warnings.map((w) => (
            <p key={w} className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5 shrink-0" /> {w}</p>
          ))}
        </div>
      )}

      <button type="button" className="sd-btn primary w-full justify-center !py-3 !text-base" onClick={run} disabled={!ready || busy}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
        {busy ? "Menyimpan price list Apple…" : ready && merged ? `Simpan Price List Apple · ${merged.items.length} tipe` : "Simpan Price List Apple"}
      </button>

      {state === "ok" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" role="status">
          <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-4" /> Price list Apple tersimpan</p>
          <p>{msg}</p>
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
