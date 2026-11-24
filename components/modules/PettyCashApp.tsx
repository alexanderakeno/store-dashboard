"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { PC_ACCOUNTS, cleanRows, fileName, mainMonth, rpForm, totals, type PcHeader, type PcRow } from "@/lib/domain/pettyCash";
import { loadPdfJs } from "./pdfText";
import { postJson } from "./postJson";
import { buildPettyCashPdf, type PcImage } from "./pettyCashPdf";

/** Final PDF must stay under 2 MB (portal limit) — aim a bit lower. */
const MAX_PDF = 1_900_000;
/** Compression ladder for the invoice pages: pixel budget per page + JPEG quality. */
const LEVELS = [
  { px: 1_600_000, q: 0.55 }, { px: 1_250_000, q: 0.45 }, { px: 1_000_000, q: 0.4 }, { px: 800_000, q: 0.36 },
  { px: 620_000, q: 0.33 }, { px: 480_000, q: 0.3 }, { px: 360_000, q: 0.28 }, { px: 260_000, q: 0.25 },
];
const HEADER_KEY = "sd.pettyCash.header.v1";

interface SrcPage { id: string; name: string; master: Blob; w: number; h: number; thumb: string; state: "wait" | "read" | "ok" | "skip" | "error"; msg?: string }

interface PdfJsRender {
  getDocument(src: { data: Uint8Array }): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getViewport(o: { scale: number }): { width: number; height: number }; render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> } }> }> };
}

const uid = () => Math.random().toString(36).slice(2, 10);
const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_048_576).toFixed(2)} MB` : `${Math.round(n / 1024)} KB`);

function canvasOf(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Gagal mengompres gambar"))), "image/jpeg", q));

/** Every page of the uploaded files → a high-quality JPEG "master" (≤ 2.4 MP), kept only in this tab. */
async function readFiles(files: File[]): Promise<SrcPage[]> {
  const out: SrcPage[] = [];
  const MASTER_PX = 2_400_000;
  const push = async (name: string, c: HTMLCanvasElement) => {
    const master = await toBlob(c, 0.85);
    const t = canvasOf(160, (160 * c.height) / c.width);
    t.getContext("2d")!.drawImage(c, 0, 0, t.width, t.height);
    out.push({ id: uid(), name, master, w: c.width, h: c.height, thumb: t.toDataURL("image/jpeg", 0.6), state: "wait" });
  };
  for (const f of files) {
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      const lib = (await loadPdfJs()) as unknown as PdfJsRender;
      const doc = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const v1 = page.getViewport({ scale: 1 });
        const scale = Math.min(3, Math.sqrt(MASTER_PX / (v1.width * v1.height)));
        const vp = page.getViewport({ scale });
        const c = canvasOf(vp.width, vp.height);
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        await push(`${f.name} · hal ${p}`, c);
      }
    } else if (f.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name)) {
      let bmp: ImageBitmap;
      try {
        bmp = await createImageBitmap(f);
      } catch {
        throw new Error(`${f.name}: format gambar tidak didukung browser (pakai JPG/PNG atau PDF)`);
      }
      const s = Math.min(1, Math.sqrt(MASTER_PX / (bmp.width * bmp.height)));
      const c = canvasOf(bmp.width * s, bmp.height * s);
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      await push(f.name, c);
    } else throw new Error(`${f.name}: hanya PDF / JPG / PNG`);
  }
  return out;
}

/** Re-encode a master at a pixel budget + quality (optionally grayscale — receipts stay readable, ~30% smaller). */
async function encode(p: SrcPage, px: number, q: number, gray: boolean): Promise<PcImage> {
  const bmp = await createImageBitmap(p.master);
  const s = Math.min(1, Math.sqrt(px / (p.w * p.h)));
  const c = canvasOf(p.w * s, p.h * s);
  const ctx = c.getContext("2d")!;
  if (gray) ctx.filter = "grayscale(1) contrast(1.08)";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const b = await toBlob(c, q);
  return { bytes: new Uint8Array(await b.arrayBuffer()), width: c.width, height: c.height };
}

async function base64(b: Blob): Promise<string> {
  const u = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
  return u.slice(u.indexOf(",") + 1);
}

export function PettyCashApp({ defaults, today, ai }: { defaults: { storeName: string; storeCode: string; location: string }; today: string; ai: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [header, setHeader] = useState<PcHeader>({ storeName: defaults.storeName, storeCode: defaults.storeCode, location: defaults.location, pcrsNo: "", fund: 500_000, paymentRound: "-", inProcess: "-", preparedBy: "", approvedBy: "" });
  const [pages, setPages] = useState<SrcPage[]>([]);
  const [rows, setRows] = useState<PcRow[]>([]);
  const [gray, setGray] = useState(true);
  const [busy, setBusy] = useState<"" | "read" | "ai" | "pdf">("");
  const [err, setErr] = useState("");
  const [out, setOut] = useState<{ url: string; size: number; name: string; stale: boolean } | null>(null);
  const [drag, setDrag] = useState(false);

  // header fields are remembered on this device (store identity, fund, names)
  useEffect(() => {
    try {
      const s = localStorage.getItem(HEADER_KEY);
      if (s) setHeader((h) => ({ ...h, ...(JSON.parse(s) as Partial<PcHeader>) }));
    } catch {}
  }, []);
  const setH = (patch: Partial<PcHeader>) =>
    setHeader((h) => {
      const n = { ...h, ...patch };
      try {
        localStorage.setItem(HEADER_KEY, JSON.stringify(n));
      } catch {}
      return n;
    });
  useEffect(() => setOut((o) => (o ? { ...o, stale: true } : o)), [rows, header, gray]);
  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => void loadPdfJs().catch(() => {}));
  }, []);

  const clean = useMemo(() => cleanRows(rows), [rows]);
  const t = useMemo(() => totals(clean), [clean]);
  const ym = mainMonth(clean, today.slice(0, 7));
  const name = fileName(header.storeCode, ym);
  const pageById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);

  const patchRow = (id: string, patch: Partial<PcRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch, uncertain: false } : r)));
  const setPage = (id: string, patch: Partial<SrcPage>) => setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function buildPdf(rs: PcRow[], allPages: SrcPage[], h: PcHeader) {
    setBusy("pdf");
    setErr("");
    try {
      const byId = new Map(allPages.map((p) => [p.id, p]));
      const ordered: SrcPage[] = [];
      const seen = new Set<string>();
      for (const r of cleanRows(rs)) for (const pid of r.pages) if (!seen.has(pid) && byId.has(pid)) { seen.add(pid); ordered.push(byId.get(pid)!); }
      const title = fileName(h.storeCode, mainMonth(cleanRows(rs), today.slice(0, 7))).replace(/\.pdf$/, "");
      let bytes: Uint8Array | null = null;
      for (const lv of LEVELS) {
        const imgs: PcImage[] = [];
        for (const p of ordered) imgs.push(await encode(p, lv.px, lv.q, gray));
        bytes = await buildPettyCashPdf(h, cleanRows(rs), imgs, title);
        if (bytes.length <= MAX_PDF) break;
      }
      if (!bytes) throw new Error("PDF gagal dibuat");
      if (bytes.length > MAX_PDF) throw new Error(`PDF masih ${kb(bytes.length)} — terlalu banyak halaman invoice. Pisahkan jadi 2 klaim.`);
      setOut((o) => {
        if (o) URL.revokeObjectURL(o.url);
        return { url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })), size: bytes!.length, name: `${title}.pdf`, stale: false };
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function onFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setErr("");
    setBusy("read");
    let added: SrcPage[];
    try {
      added = await readFiles(files);
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
      return;
    }
    const allPages = [...pages, ...added];
    setPages(allPages);
    if (!ai) {
      // manual mode: one empty row per page, to be typed in
      const nr = added.map((p) => ({ id: uid(), date: "", pcv: "", description: "", account: "sundries" as const, amount: 0, pages: [p.id] }));
      setRows((rs) => [...rs, ...nr]);
      setBusy("");
      return;
    }
    setBusy("ai");
    // read every page with AI (3 at a time); a page that is not a receipt is attached to the previous row
    const results: Array<{ p: SrcPage; r: Awaited<ReturnType<typeof readOne>> }> = new Array(added.length);
    let next = 0;
    async function readOne(p: SrcPage) {
      setPage(p.id, { state: "read" });
      try {
        const small = await encode(p, 1_300_000, 0.7, false);
        const res = await postJson("/api/petty-cash/extract", { image: await base64(new Blob([small.bytes as BlobPart], { type: "image/jpeg" })) });
        const j = (await res.json().catch(() => ({}))) as { error?: string; isReceipt?: boolean; date?: string; description?: string; account?: PcRow["account"]; amount?: number; uncertain?: boolean };
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        setPage(p.id, { state: j.isReceipt === false ? "skip" : "ok" });
        return j;
      } catch (e) {
        setPage(p.id, { state: "error", msg: (e as Error).message });
        return { error: (e as Error).message };
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, added.length) }, async () => {
      while (next < added.length) {
        const i = next++;
        results[i] = { p: added[i], r: await readOne(added[i]) };
      }
    }));
    const nr: PcRow[] = [];
    for (const { p, r } of results) {
      const prev = nr[nr.length - 1];
      if ("isReceipt" in r && r.isReceipt === false && prev) {
        prev.pages.push(p.id);
        continue;
      }
      const ok = !("error" in r);
      const x = r as { date?: string; description?: string; account?: PcRow["account"]; amount?: number; uncertain?: boolean };
      nr.push({ id: uid(), date: ok ? x.date ?? "" : "", pcv: "", description: ok ? x.description ?? "" : "", account: (ok && x.account) || "sundries", amount: ok ? x.amount ?? 0 : 0, pages: [p.id], uncertain: !ok || !!x.uncertain });
    }
    const allRows = [...rows, ...nr];
    setRows(allRows);
    setBusy("");
    if (allRows.length && allRows.every((r) => r.amount && r.date)) await buildPdf(allRows, allPages, header);
  }

  function removePage(id: string) {
    setPages((ps) => ps.filter((p) => p.id !== id));
    setRows((rs) => rs.map((r) => ({ ...r, pages: r.pages.filter((x) => x !== id) })).filter((r) => r.pages.length || r.description || r.amount));
  }
  function reset() {
    setPages([]);
    setRows([]);
    setErr("");
    setOut((o) => {
      if (o) URL.revokeObjectURL(o.url);
      return null;
    });
  }

  const missing = clean.filter((r) => !r.date || !r.amount || !r.description.trim()).length;
  const field = "sd-input w-full";

  return (
    <div className="space-y-5">
      {/* 1. upload */}
      <section className="sd-panel p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black sm:text-lg">1. Upload invoice / struk</h3>
            <p className="mt-1 text-sm text-slate-500">
              PDF (boleh banyak halaman) atau foto JPG/PNG. {ai ? "Tanggal, keterangan dan nominal dibaca otomatis — cek lalu PDF langsung dibuat." : "Pembacaan otomatis belum aktif (API key AI belum diisi) — isi baris secara manual."}
            </p>
          </div>
          {pages.length > 0 && <button type="button" className="sd-btn" onClick={reset} disabled={!!busy}><X className="size-4" aria-hidden /> Mulai baru</button>}
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void onFiles(e.dataTransfer.files); }}
          onClick={() => !busy && input.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center ${drag ? "border-blue-500 bg-blue-50" : "border-slate-300"}`}
        >
          {busy === "read" || busy === "ai" ? <Loader2 className="size-7 animate-spin text-blue-600" aria-hidden /> : <Upload className="size-7 text-slate-400" aria-hidden />}
          <p className="text-sm font-semibold">
            {busy === "read" ? "Membaca file…" : busy === "ai" ? `Membaca struk dengan AI… (${pages.filter((p) => p.state === "ok" || p.state === "skip" || p.state === "error").length}/${pages.length})` : "Klik atau tarik file ke sini"}
          </p>
          <input ref={input} type="file" multiple accept=".pdf,application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
        </div>
        {pages.length > 0 && (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {pages.map((p, i) => (
              <figure key={p.id} className="relative w-24 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt={p.name} className="h-32 w-24 rounded-lg border border-slate-200 object-cover object-top" />
                <figcaption className="mt-1 truncate text-[10px] text-slate-500" title={p.msg ?? p.name}>
                  {p.state === "read" ? "membaca…" : p.state === "error" ? `gagal: ${p.msg ?? ""}` : p.state === "skip" ? "lanjutan / bukan struk" : `Hal ${i + 1}`}
                </figcaption>
                <button type="button" aria-label="Hapus halaman" className="absolute top-1 right-1 rounded-full bg-white/90 p-0.5 shadow" onClick={() => removePage(p.id)} disabled={!!busy}><X className="size-3" /></button>
              </figure>
            ))}
          </div>
        )}
      </section>

      {/* 2. rows */}
      <section className="sd-panel p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black sm:text-lg">2. Cek daftar klaim</h3>
            <p className="mt-1 text-sm text-slate-500">Baris kuning = AI kurang yakin, mohon dicek dengan gambar struknya. Urutan di PDF mengikuti tanggal.</p>
          </div>
          <button type="button" className="sd-btn" onClick={() => setRows((rs) => [...rs, { id: uid(), date: "", pcv: "", description: "", account: "sundries", amount: 0, pages: [] }])}><Plus className="size-4" aria-hidden /> Tambah baris</button>
        </div>
        <div className="sd-table-wrap">
          <table className="sd-table sd-table-compact">
            <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Akun</th><th className="text-right">Nominal</th><th>Struk</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Belum ada invoice.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className={r.uncertain ? "bg-amber-50" : ""}>
                  <td className="min-w-36"><input type="date" className={field} value={r.date} onChange={(e) => patchRow(r.id, { date: e.target.value })} /></td>
                  <td className="min-w-72"><input className={field} value={r.description} maxLength={120} placeholder="mis. Tisu, pembersih lantai (Transmart)" onChange={(e) => patchRow(r.id, { description: e.target.value })} /></td>
                  <td className="min-w-32">
                    <select className="sd-select w-full" value={r.account} onChange={(e) => patchRow(r.id, { account: e.target.value as PcRow["account"] })}>
                      {PC_ACCOUNTS.map((a) => <option key={a.key} value={a.key}>{a.label} {a.code}</option>)}
                    </select>
                  </td>
                  <td className="min-w-32"><input inputMode="numeric" className={`${field} text-right`} value={r.amount ? r.amount.toLocaleString("id-ID") : ""} placeholder="0" onChange={(e) => patchRow(r.id, { amount: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></td>
                  <td>
                    <div className="flex gap-1">
                      {r.pages.map((pid) => { const p = pageById.get(pid); return p ? <a key={pid} href={p.thumb} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); window.open(URL.createObjectURL(p.master), "_blank"); }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.thumb} alt="" className="h-10 w-8 rounded border border-slate-200 object-cover object-top" /></a> : null; })}
                    </div>
                  </td>
                  <td><button type="button" aria-label="Hapus baris" className="sd-btn" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}><Trash2 className="size-4" /></button></td>
                </tr>
              ))}
            </tbody>
            {clean.length > 0 && <tfoot><tr><td colSpan={3} className="font-black">Grand Total ({clean.length} invoice)</td><td className="text-right font-black">{rpForm(t.grand)}</td><td colSpan={2} /></tr></tfoot>}
          </table>
        </div>
      </section>

      {/* 3. form header */}
      <details className="sd-panel p-5 sm:p-6">
        <summary className="cursor-pointer text-base font-black sm:text-lg">3. Data form (tersimpan di perangkat ini)</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label><span className="sd-label">Store Name</span><input className={field} value={header.storeName} onChange={(e) => setH({ storeName: e.target.value })} /></label>
          <label><span className="sd-label">Store Code</span><input className={field} value={header.storeCode} onChange={(e) => setH({ storeCode: e.target.value })} /></label>
          <label><span className="sd-label">Location</span><input className={field} value={header.location} onChange={(e) => setH({ location: e.target.value })} /></label>
          <label><span className="sd-label">PCRS No (opsional)</span><input className={field} value={header.pcrsNo} onChange={(e) => setH({ pcrsNo: e.target.value })} /></label>
          <label><span className="sd-label">Petty Cash Fund</span><input inputMode="numeric" className={field} value={header.fund ? header.fund.toLocaleString("id-ID") : ""} onChange={(e) => setH({ fund: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
          <label><span className="sd-label">Payment (Round)</span><input className={field} value={header.paymentRound} onChange={(e) => setH({ paymentRound: e.target.value })} /></label>
          <label><span className="sd-label">Prepared by (PIC)</span><input className={field} value={header.preparedBy} onChange={(e) => setH({ preparedBy: e.target.value })} /></label>
          <label><span className="sd-label">Approved by (OIC)</span><input className={field} value={header.approvedBy} onChange={(e) => setH({ approvedBy: e.target.value })} /></label>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={gray} onChange={(e) => setGray(e.target.checked)} /> Lampiran hitam-putih (file lebih kecil)</label>
        </div>
        <p className="mt-3 text-xs text-slate-500">Kolom tanda tangan di PDF selalu dikosongkan.</p>
      </details>

      {/* 4. PDF */}
      <section className="sd-panel p-5 sm:p-6">
        <h3 className="text-base font-black sm:text-lg">4. PDF Petty Cash</h3>
        <p className="mt-1 text-sm text-slate-500">Halaman 1 = form Petty Cash Replenishment Summary, berikutnya lampiran invoice. Dikompres otomatis sampai di bawah 2 MB.</p>
        {missing > 0 && <p className="mt-3 flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="size-4" aria-hidden /> {missing} baris belum lengkap (tanggal / keterangan / nominal).</p>}
        {err && <p className="mt-3 flex items-center gap-2 text-sm text-rose-600"><AlertTriangle className="size-4" aria-hidden /> {err}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="sd-btn primary" disabled={!!busy || clean.length === 0} onClick={() => void buildPdf(rows, pages, header)}>
            {busy === "pdf" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileText className="size-4" aria-hidden />} {out ? "Buat ulang PDF" : "Buat PDF"}
          </button>
          {out && (
            <a className={`sd-btn ${out.stale ? "" : "success"}`} href={out.url} download={out.name}>
              <Download className="size-4" aria-hidden /> {out.name} · {kb(out.size)}
            </a>
          )}
          {out && !out.stale && <span className="flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="size-4" aria-hidden /> di bawah 2 MB</span>}
          {out?.stale && <span className="text-sm text-amber-700">Ada perubahan — klik Buat ulang PDF.</span>}
          {ai && <span className="ml-auto flex items-center gap-1 text-xs text-slate-500"><Sparkles className="size-3.5" aria-hidden /> Baca otomatis aktif</span>}
        </div>
        {out && !out.stale && <iframe title="Pratinjau PDF" src={out.url} className="mt-4 h-[70vh] w-full rounded-xl border border-slate-200 max-sm:hidden" />}
        <p className="mt-3 text-xs text-slate-400">File disimpan sebagai {name}. Invoice diproses di browser; untuk pembacaan otomatis tiap halaman dikirim sementara ke layanan AI dan tidak disimpan.</p>
      </section>
    </div>
  );
}
