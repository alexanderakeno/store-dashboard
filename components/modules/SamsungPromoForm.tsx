"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { parseSamsungPromo, type SheetGrid } from "@/lib/parsers/samsungPromo";
import { loadSheetJS } from "./ImportRawForm";
import { postJson } from "./postJson";

type Parsed = ReturnType<typeof parseSamsungPromo> & { source: string };

/**
 * Import the Samsung promo workbook (.xlsx): every sheet is read in the browser, the summary and
 * detail sheets are parsed, and the result replaces the stored promo.
 */
export function SamsungPromoForm({ current }: { current: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pick = async (f: File | undefined) => {
    setParsed(null);
    setMsg(null);
    if (!f) return;
    setBusy(true);
    try {
      const XLSX = await loadSheetJS();
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
      const sheets: SheetGrid[] = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true }) }));
      const title = f.name.replace(/\.xlsx?$/i, "");
      const r = parseSamsungPromo(sheets, { title });
      if (!r.programs.length && !r.articles.length) throw new Error("Tidak ditemukan sheet List Promo Samsung maupun tabel artikel promo.");
      setParsed({ ...r, source: f.name });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!parsed) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await postJson("/api/samsung-promo", parsed);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `Gagal (HTTP ${r.status})`);
      setMsg({ ok: true, text: body.message ?? "Tersimpan" });
      setParsed(null);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        File Excel <b>List Promo Aktif Samsung</b> (sheet List Promo + sheet detail PWP / Trade In / EIP). Menimpa promo tersimpan
        {current ? <> (saat ini: {current})</> : null} · tab APP_SamsungPromo di master sheet. Nilai & kode diambil dari sheet detail.
      </p>
      <label className="relative flex min-h-[84px] cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 p-4 dark:border-slate-700">
        <input ref={input} type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" disabled={busy} className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800">{busy ? <Loader2 className="size-6 animate-spin" /> : <FileSpreadsheet className="size-6" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-950">Pilih file promo Samsung (.xlsx)</span>
          <span className="block text-sm text-slate-500">Semua sheet dibaca otomatis.</span>
        </span>
      </label>
      {parsed && (
        <div className="sd-log-acct !block text-sm">
          <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-4 text-emerald-600" /> {parsed.source}</p>
          <p className="mt-1 text-slate-600">{parsed.programs.length} program di List Promo · {parsed.articles.length} artikel promo · {parsed.pairs.length} barang pasangan PWP · {parsed.sheets.length} sheet detail</p>
          {parsed.warnings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {parsed.warnings.map((w) => <li key={w} className="flex gap-1.5 text-xs text-amber-700"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{w}</li>)}
            </ul>
          )}
        </div>
      )}
      {msg && <div className={`alert ${msg.ok ? "ok" : "warn"} small`}>{msg.text}</div>}
      {parsed && (
        <button type="button" className="sd-btn primary w-full justify-center !py-3 !text-base" onClick={() => void save()} disabled={busy}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />} Simpan Promo Samsung
        </button>
      )}
    </div>
  );
}
