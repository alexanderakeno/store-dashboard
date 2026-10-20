"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { parseMrReport } from "@/lib/parsers/mrReport";
import type { MerchLine } from "@/types/domain";
import { readRows } from "./ImportRawForm";
import { postJson } from "./postJson";

const ACCEPT = ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const label = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const nf = new Intl.NumberFormat("id-ID");
const rp = (n: number) => `Rp${nf.format(Math.round(n))}`;

interface Month {
  month: string;
  file: string;
  rows: MerchLine[];
  qty: number;
  net: number;
  ok: boolean; // matches the file's Grand Total
  warnings: string[];
  status?: "saving" | "saved" | "error";
  msg?: string;
}

/**
 * Data Tahun Lalu: pick one or more Merchandise Report exports (one per month). Each file is read
 * and checked in the browser (rows vs Grand Total), then saved per month to the master sheet.
 */
export function HistoryImportForm({ existing }: { existing: string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [months, setMonths] = useState<Month[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async (files: FileList | null) => {
    setMonths([]);
    setErrors([]);
    if (!files?.length) return;
    setReading(true);
    const out: Month[] = [];
    const errs: string[] = [];
    for (const f of [...files]) {
      try {
        const grid = await readRows(f, 9);
        if (String(grid[0]?.[0] ?? "").trim().toLowerCase() !== "brand name") {
          errs.push(`${f.name}: bukan Merchandise Report (header "Brand Name" tidak ditemukan).`);
          continue;
        }
        const r = parseMrReport(grid);
        if (!r.rows.length) {
          errs.push(`${f.name}: tidak ada baris penjualan.`);
          continue;
        }
        const ok = !!r.grand && !r.warnings.some((w) => w.startsWith("Total baris"));
        for (const m of r.months) {
          const rows = r.rows.filter((x) => x.date.startsWith(m));
          if (out.some((x) => x.month === m)) {
            errs.push(`${label(m)} ada di lebih dari satu file — pilih satu file per bulan.`);
            continue;
          }
          out.push({ month: m, file: f.name, rows, qty: rows.reduce((a, x) => a + x.qty, 0), net: rows.reduce((a, x) => a + x.net, 0), ok, warnings: r.warnings });
        }
      } catch (e) {
        errs.push((e as Error).message);
      }
    }
    out.sort((a, b) => a.month.localeCompare(b.month));
    setMonths(out);
    setErrors(errs);
    setReading(false);
  };

  const save = async () => {
    setBusy(true);
    for (const m of months) {
      if (m.status === "saved") continue;
      setMonths((s) => s.map((x) => (x.month === m.month ? { ...x, status: "saving", msg: undefined } : x)));
      try {
        const r = await postJson("/api/history", { month: m.month, source: m.file, rows: m.rows });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? `Gagal (HTTP ${r.status})`);
        setMonths((s) => s.map((x) => (x.month === m.month ? { ...x, status: "saved" } : x)));
      } catch (e) {
        setMonths((s) => s.map((x) => (x.month === m.month ? { ...x, status: "error", msg: (e as Error).message } : x)));
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  const pending = months.filter((m) => m.status !== "saved");
  return (
    <div className="stack">
      <label className="block">
        <span className="sd-label">File Merchandise Report (.xls / .xlsx) — boleh pilih beberapa bulan sekaligus</span>
        <input ref={input} type="file" accept={ACCEPT} multiple disabled={busy} onChange={(e) => void pick(e.target.files)} className="sd-input mt-1 w-full" />
      </label>
      {reading && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Membaca file…</p>}
      {errors.map((e) => <div key={e} className="alert error small">{e}</div>)}
      {months.length > 0 && (
        <ul className="space-y-2">
          {months.map((m) => (
            <li key={m.month} className="sd-log-acct !items-start">
              {m.status === "saved" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : m.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-slate-400" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />}
              <span className="min-w-0 flex-1 text-sm">
                <b>{label(m.month)}</b>
                {existing.includes(m.month) && m.status !== "saved" && <span className="ml-1.5 text-xs font-semibold text-amber-600">menimpa data lama</span>}
                <span className="block text-xs text-slate-500">{m.file} · {nf.format(m.rows.length)} baris · {nf.format(m.qty)} qty · {rp(m.net)}</span>
                {m.ok ? <span className="block text-xs text-emerald-600">Cocok dengan Grand Total file</span> : m.warnings.map((w) => <span key={w} className="block text-xs text-amber-600">{w}</span>)}
                {m.status === "error" && <span className="block text-xs text-rose-600">{m.msg}</span>}
              </span>
              <span className="shrink-0 text-xs font-semibold text-slate-500">{m.status === "saving" ? <Loader2 className="size-4 animate-spin" /> : m.status === "saved" ? "tersimpan" : ""}</span>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <div className="row">
          <button type="button" className="btn primary" disabled={busy || reading} onClick={() => void save()}>
            <Upload className="size-4" /> {busy ? "Menyimpan…" : `Simpan ${pending.length} bulan`}
          </button>
        </div>
      )}
    </div>
  );
}
