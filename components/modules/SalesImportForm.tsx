"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { parseDate } from "@/lib/domain/normalize";
import { parseMrReport } from "@/lib/parsers/mrReport";
import type { MerchLine } from "@/types/domain";
import { loadSheetJS, readRows } from "./ImportRawForm";
import { postJson } from "./postJson";

type Rows = Array<Array<string | number | boolean | null>>;

const ACCEPT = ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const label = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const nf = new Intl.NumberFormat("id-ID");
/** Rows per history request (one request ≈ 1.5–2 MB before gzip at this size). */
const HISTORY_BATCH_ROWS = 12_000;
const rp = (n: number) => `Rp${nf.format(Math.round(n))}`;

/** One month of work: either the monthly Google Sheet (MR and/or Sales Person) or stored MR history. */
interface Job {
  month: string;
  target: "sheet" | "history";
  mr?: { file: string; raw: Rows | null; rows: MerchLine[]; qty: number; net: number; ok: boolean; warnings: string[] };
  sp?: { file: string; raw: Rows };
  notes: string[];
  status?: "busy" | "done" | "error";
  msg?: string;
}

/** Month of a Sales Person export: the month most of its dates fall in (null when no dates are found). */
function spMonth(rows: Rows): string | null {
  const count = new Map<string, number>();
  for (const r of rows)
    for (const c of r.slice(0, 3)) {
      if (typeof c !== "string" || !/\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(c)) continue;
      const d = parseDate(c.trim(), { slashOrder: "DMY" });
      if (d) count.set(d.slice(0, 7), (count.get(d.slice(0, 7)) ?? 0) + 1);
    }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

/**
 * The single place to import sales data. Any number of Merchandise Report / Sales Person files, any
 * months: each file's dates decide where it goes. A month with a registered monthly Google Sheet is
 * imported into that sheet (Control MR & SP, as before); any other month's Merchandise Report is
 * stored as history for LFL / YTD / Compare.
 */
export function SalesImportForm({ sheetMonths, historyMonths }: { sheetMonths: string[]; historyMonths: string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => void loadSheetJS().catch(() => {}));
  }, []);

  const pick = async (files: FileList | null) => {
    setJobs([]);
    setErrors([]);
    if (!files?.length) return;
    setReading(true);
    const map = new Map<string, Job>();
    const errs: string[] = [];
    const job = (month: string) => {
      let j = map.get(month);
      if (!j) map.set(month, (j = { month, target: sheetMonths.includes(month) ? "sheet" : "history", notes: [] }));
      return j;
    };
    const spPending: Array<{ file: string; raw: Rows }> = [];
    for (const f of [...files]) {
      let grid: Rows;
      try {
        grid = await readRows(f, 9);
      } catch (e) {
        errs.push((e as Error).message);
        continue;
      }
      const isMr = String(grid[0]?.[0] ?? "").trim().toLowerCase() === "brand name";
      if (!isMr) {
        spPending.push({ file: f.name, raw: grid.map((r) => r.slice(0, 3)) });
        continue;
      }
      const r = parseMrReport(grid);
      if (!r.rows.length) {
        errs.push(`${f.name}: tidak ada baris penjualan.`);
        continue;
      }
      const ok = !!r.grand && !r.warnings.some((w) => w.startsWith("Total baris"));
      for (const m of r.months) {
        const j = job(m);
        if (j.mr) {
          errs.push(`${label(m)} ada di 2 file Merchandise Report (${j.mr.file} dan ${f.name}) — pilih satu.`);
          continue;
        }
        const rows = r.rows.filter((x) => x.date.startsWith(m));
        // the monthly sheet takes the raw file as-is (Apps Script), so it must hold only that month
        const single = r.months.length === 1;
        j.mr = { file: f.name, raw: single ? grid : null, rows, qty: rows.reduce((a, x) => a + x.qty, 0), net: rows.reduce((a, x) => a + x.net, 0), ok, warnings: r.warnings };
        if (j.target === "sheet" && !single) j.notes.push(`${f.name} berisi ${r.months.length} bulan — untuk Google Sheet ${label(m)} upload file MR khusus bulan ini.`);
      }
    }
    for (const sp of spPending) {
      const sheetJobs = [...map.values()].filter((j) => j.target === "sheet");
      const m = spMonth(sp.raw) ?? (sheetJobs.length === 1 ? sheetJobs[0].month : null);
      if (!m) {
        errs.push(`${sp.file}: bulan tidak terbaca dari isi file. Upload bersama file Merchandise Report bulan yang sama.`);
        continue;
      }
      const j = job(m);
      if (j.target !== "sheet") {
        errs.push(`${sp.file} (Sales Person ${label(m)}): bulan ini tidak punya file Google Sheet bulanan, jadi data per sales tidak disimpan. Merchandise Report-nya saja yang dipakai.`);
        if (!j.mr) map.delete(m);
        continue;
      }
      if (j.sp) {
        errs.push(`${label(m)} ada di 2 file Sales Person (${j.sp.file} dan ${sp.file}) — pilih satu.`);
        continue;
      }
      j.sp = sp;
    }
    setJobs([...map.values()].sort((a, b) => a.month.localeCompare(b.month)));
    setErrors(errs);
    setReading(false);
  };

  const runnable = (j: Job) => j.status !== "done" && (j.target === "history" ? !!j.mr : !!(j.mr?.raw || j.sp));

  /** History months go to the server together (one sheet write), sheet months one by one (Apps Script). */
  const run = async () => {
    setBusy(true);
    const set = (month: string, patch: Partial<Job>) => setJobs((s) => s.map((x) => (x.month === month ? { ...x, ...patch } : x)));
    const hist = jobs.filter((j) => runnable(j) && j.target === "history");
    // a request stays well under Vercel's body limit: split very large uploads by row count
    const batches: Job[][] = [];
    let cur: Job[] = [];
    let n = 0;
    for (const j of hist) {
      if (cur.length && n + j.mr!.rows.length > HISTORY_BATCH_ROWS) {
        batches.push(cur);
        cur = [];
        n = 0;
      }
      cur.push(j);
      n += j.mr!.rows.length;
    }
    if (cur.length) batches.push(cur);
    for (const b of batches) {
      for (const j of b) set(j.month, { status: "busy", msg: undefined });
      try {
        const r = await postJson("/api/history", { months: b.map((j) => ({ month: j.month, source: j.mr!.file, rows: j.mr!.rows })) });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? `Gagal (HTTP ${r.status})`);
        for (const j of b) set(j.month, { status: "done" });
      } catch (e) {
        for (const j of b) set(j.month, { status: "error", msg: (e as Error).message });
      }
    }
    for (const j of jobs.filter((x) => runnable(x) && x.target === "sheet")) {
      set(j.month, { status: "busy", msg: undefined });
      try {
        const r = await postJson("/api/import-raw", { month: j.month, mr: j.mr?.raw ? j.mr.raw : null, sp: j.sp?.raw ?? null });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? `Gagal (HTTP ${r.status})`);
        set(j.month, { status: "done", msg: body.message });
      } catch (e) {
        set(j.month, { status: "error", msg: (e as Error).message });
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  const todo = jobs.filter(runnable);
  return (
    <div className="space-y-3">
      <label className="relative flex min-h-[84px] cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 p-4 dark:border-slate-700">
        <input ref={input} type="file" accept={ACCEPT} multiple disabled={busy} className="sr-only" onChange={(e) => void pick(e.target.files)} />
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800">
          {reading ? <Loader2 className="size-6 animate-spin" /> : <FileSpreadsheet className="size-6" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-950">Pilih file Merchandise Report / Sales Person (.xls)</span>
          <span className="block text-sm text-slate-500">Boleh banyak file & bulan apa saja sekaligus — bulan dibaca otomatis dari tanggal di file.</span>
        </span>
      </label>

      {errors.map((e) => (
        <div key={e} className="alert warn small">{e}</div>
      ))}

      {jobs.length > 0 && (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.month} className="sd-log-acct !items-start">
              {j.status === "done" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : j.status === "error" || (j.mr && !j.mr.ok) || j.notes.length ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-slate-400" />
              )}
              <span className="min-w-0 flex-1 text-sm">
                <b>{label(j.month)}</b>
                <span className="ml-1.5 text-xs font-semibold text-slate-500">
                  → {j.target === "sheet" ? "Google Sheet bulanan" : "riwayat penjualan"}
                  {j.target === "history" && historyMonths.includes(j.month) && j.status !== "done" ? " · menimpa data lama" : ""}
                </span>
                {j.mr && (
                  <span className="block text-xs text-slate-500">
                    MR: {j.mr.file} · {nf.format(j.mr.rows.length)} baris · {nf.format(j.mr.qty)} qty · {rp(j.mr.net)}
                    {j.mr.ok ? <span className="text-emerald-600"> · cocok Grand Total</span> : null}
                  </span>
                )}
                {j.sp && <span className="block text-xs text-slate-500">Sales Person: {j.sp.file}</span>}
                {j.mr && !j.mr.ok && j.mr.warnings.map((w) => <span key={w} className="block text-xs text-amber-600">{w}</span>)}
                {j.notes.map((n) => <span key={n} className="block text-xs text-amber-600">{n}</span>)}
                {j.msg && <span className={`block text-xs whitespace-pre-wrap ${j.status === "error" ? "text-rose-600" : "text-emerald-700"}`}>{j.msg}</span>}
              </span>
              <span className="shrink-0 text-xs font-semibold text-slate-500">{j.status === "busy" ? <Loader2 className="size-4 animate-spin" /> : j.status === "done" ? "selesai" : ""}</span>
            </li>
          ))}
        </ul>
      )}

      {todo.length > 0 && (
        <button type="button" className="sd-btn primary w-full justify-center !py-3 !text-base" onClick={() => void run()} disabled={busy || reading}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
          {busy ? "Mengimport… (bulan Google Sheet bisa 10–40 detik)" : `Import ${todo.length} bulan`}
        </button>
      )}
    </div>
  );
}
