"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileDown, X } from "lucide-react";
import { SLIDES, WSLIDES, type ReportData, type SlideId, type WSlideId } from "@/lib/domain/report";
import { STOCK_FILTER, deckFileName as fileNameOf, deckWeek, weeklyTitle, defaultManual, mergeManual, stockRows, stockSlides, type ReportManual, type StockFilter } from "@/lib/report/pptx";

type Loaded = { data: ReportData; manual: ReportManual };

const numIn = (v: string): number | null => {
  const n = Number(v.replace(/[^\d]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};
const fmt = (n: number | null | undefined) => (n == null ? "" : new Intl.NumberFormat("id-ID").format(n));
const rp = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n));

/** Overview: "Buat PPT" — pop-up for what the dashboard does not know, then downloads the .pptx. */
export function ReportBuilder({ month }: { month: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="sd-btn dark" onClick={() => setOpen(true)}>
        <FileDown size={16} aria-hidden /> Buat PPT
      </button>
      {open && <Dialog month={month} onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ month, onClose }: { month: string; onClose: () => void }) {
  const [state, setState] = useState<Loaded | { error: string } | null>(null);
  const [m, setM] = useState<ReportManual | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch(`/api/report?m=${encodeURIComponent(month)}`, { cache: "no-store" });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? `Gagal memuat data (HTTP ${r.status})`);
        const manual = mergeManual(defaultManual(b.data, b.author ?? ""), b.manual);
        if (live) {
          setState({ data: b.data, manual });
          setM(manual);
        }
      } catch (e) {
        if (live) setState({ error: (e as Error).message });
      }
    })();
    return () => {
      live = false;
    };
  }, [month]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const d = state && "data" in state ? state.data : null;
  const weekly = m?.template === "weekly";
  const wk = d && m ? deckWeek(d, m) : null;
  const count = useMemo(() => (m ? (m.template === "weekly" ? WSLIDES.filter((s) => !m.wskip.includes(s.id)).length : SLIDES.filter((s) => !m.skip.includes(s.id)).length) : 0), [m]);

  async function download(kind: "pptx" | "pdf" = "pptx") {
    if (!d || !m) return;
    setBusy("Menyimpan isian…");
    setMsg(null);
    let saved = true;
    try {
      const r = await fetch("/api/report", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: d.month, manual: m }) });
      saved = r.ok;
    } catch {
      saved = false;
    }
    const what = kind === "pdf" ? "PDF" : "PPT";
    try {
      setBusy(`Membuat ${what}…`);
      const logo = await fetch("/report-logo.png")
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => (b ? new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b); }) : null))
        .catch(() => null);
      if (kind === "pdf") {
        const { deckPdf } = await import("@/lib/report/pdfDeck");
        const bytes = await deckPdf(d, m, logo);
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = fileNameOf(d, m).replace(/\.pptx$/, ".pdf");
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      } else {
        const [{ default: PptxGenJS }, { buildDeck, deckFileName }] = await Promise.all([import("pptxgenjs"), import("@/lib/report/pptx")]);
        await buildDeck(PptxGenJS, d, m, logo).writeFile({ fileName: deckFileName(d, m) });
      }
      setMsg({ ok: true, text: `${what} terunduh.${saved ? "" : " Isian manual belum tersimpan — coba lagi nanti."}` });
    } catch (e) {
      setMsg({ ok: false, text: `Gagal membuat ${what}: ${(e as Error).message}` });
    }
    setBusy(null);
  }

  const set = (f: (x: ReportManual) => ReportManual) => setM((x) => (x ? f(structuredClone(x)) : x));
  const toggle = (id: SlideId, on: boolean) => set((x) => ({ ...x, skip: on ? x.skip.filter((k) => k !== id) : [...new Set([...x.skip, id])] }));
  const isOn = (id: SlideId) => !!m && !m.skip.includes(id);
  const wToggle = (id: WSlideId, on: boolean) => set((x) => ({ ...x, wskip: on ? x.wskip.filter((k) => k !== id) : [...new Set([...x.wskip, id])] }));
  const wOn = (id: WSlideId) => !!m && !m.wskip.includes(id);
  /** A section shows when its slide is on in the chosen template. */
  const show = (id: SlideId & WSlideId) => (weekly ? wOn(id) : isOn(id));

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Buat PPT" className="flex max-h-[94dvh] w-full max-w-[880px] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-950 dark:text-white">
              Buat PPT{d ? ` — ${weekly && wk ? weeklyTitle(d, wk) : d.title}` : ""}
              {d && <span className={`ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-[11px] font-extrabold ${d.mode === "closing" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>{weekly ? "Week vs Week" : d.mode === "closing" ? "Bulan selesai → Closing" : "Bulan berjalan → MTD"}</span>}
            </h2>
            {d && (
              <p className="mt-0.5 text-[13px] text-slate-500">
                Data dashboard s/d {Number(d.asOf.slice(8))} {d.monthName} {d.year}
                {weekly && wk ? ` · ${wk.label} (${wk.period}) dibanding ${wk.prevLabel}${wk.prevPeriod ? ` (${wk.prevPeriod})` : ""}` : d.hasPrev ? ` · dibanding ${d.prevLabel}` : " · bulan lalu belum ada datanya"}
                {!weekly && d.hasLy ? ` · LFL ${d.lyShort}` : ""}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-slate-700" aria-label="Tutup">
            <X size={22} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {!state && <p className="py-10 text-center text-sm text-slate-500">Memuat data bulan ini…</p>}
          {state && "error" in state && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{state.error}</p>}
          {d && m && (
            <>
              <Sec title="Template" note={weekly ? "week dibanding week sebelumnya" : "month to date vs bulan lalu (MTM) & tahun lalu (LFL)"}>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Template PPT">
                  {([["mtd", "MTD (tanggal berjalan)"], ["weekly", "Weekly (Week vs Week)"]] as const).map(([k, label]) => (
                    <button key={k} type="button" role="radio" aria-checked={m.template === k} disabled={k === "weekly" && !d.wow?.length} onClick={() => set((x) => ({ ...x, template: k }))} className={`rounded-xl border px-3.5 py-2 text-[13px] font-bold disabled:opacity-40 ${m.template === k ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {weekly && wk && (
                  <div className="mt-3">
                    <span className="sd-label">Week</span>
                    <div className="flex flex-wrap gap-1.5">
                      {d.wow.map((w) => (
                        <button key={w.index} type="button" aria-pressed={w.index === wk.index} onClick={() => set((x) => ({ ...x, week: w.index }))} className={`rounded-lg border px-2.5 py-1 text-left text-[12px] font-bold ${w.index === wk.index ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"}`}>
                          {w.label} vs {w.prevLabel}
                          <span className="block text-[10px] font-semibold opacity-75">{w.period}{w.running ? " · berjalan" : ""}</span>
                        </button>
                      ))}
                    </div>
                    {wk.running && <p className="mt-1.5 text-[11px] text-amber-700">Week ini masih berjalan ({wk.days} hari): {wk.prevLabel} dihitung untuk {wk.days} hari pertama juga, supaya sebanding.</p>}
                    {!wk.prev && <p className="mt-1.5 text-[11px] text-slate-500">Data week sebelumnya belum ada — kolom pembanding dikosongkan.</p>}
                  </div>
                )}
              </Sec>

              {weekly ? (
                <Sec title="Slide" badge={<Auto />} note={`${count} dari ${WSLIDES.length} slide ikut`}>
                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {WSLIDES.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 py-0.5 text-[13px]">
                        <input type="checkbox" className="size-4 accent-blue-600" checked={wOn(s.id)} disabled={s.id === "stock" && !d.stockOut} onChange={(e) => wToggle(s.id, e.target.checked)} />
                        <span className={wOn(s.id) ? "" : "text-slate-400 line-through"}>{s.label}</span>
                      </label>
                    ))}
                  </div>
                </Sec>
              ) : (
              <Sec title="Slide" badge={<Auto />} note={`${count} dari ${SLIDES.length} slide ikut`}>
                <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {SLIDES.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 py-0.5 text-[13px]">
                      <input type="checkbox" className="size-4 accent-blue-600" checked={isOn(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
                      <span className={isOn(s.id) ? "" : "text-slate-400 line-through"}>{s.label}</span>
                      {s.id === "npi" && <Manual />}
                      {s.id === "bnpl" && !d.bnpl.value && <span className="text-[11px] text-slate-400">(menu BNPL kosong — bisa diketik)</span>}
                      {s.id === "ytd" && !d.ytd.some((r) => r.prev && r.cur) && <span className="text-[11px] text-slate-400">(data {d.ytdYears[0]} belum ada)</span>}
                    </label>
                  ))}
                </div>
              </Sec>
              )}

              {show("cover") && (
                <Sec title="Cover" badge={<Manual />}>
                  <label className="block max-w-md text-[13px]">
                    <span className="sd-label">Nama & NIK di cover</span>
                    <input className="sd-input" value={m.author} onChange={(e) => set((x) => ({ ...x, author: e.target.value }))} placeholder="Nama - NIK" />
                  </label>
                </Sec>
              )}

              {!weekly && isOn("productivity") && (
                <Sec title="Traffic (slide Compare Productivity)" badge={d.productivity.cur.traffic ? <Auto /> : <Manual text="ISI JIKA KOSONG" />} note="kosongkan = pakai data traffic dashboard">
                  <div className="flex flex-wrap gap-3">
                    <NumField label={d.curLabel} value={m.traffic.cur} placeholder={d.productivity.cur.traffic ? rp(d.productivity.cur.traffic) : "belum ada"} onChange={(v) => set((x) => ({ ...x, traffic: { ...x.traffic, cur: v } }))} />
                    {d.productivity.prev && <NumField label={d.prevLabel} value={m.traffic.prev} placeholder={d.productivity.prev.traffic ? rp(d.productivity.prev.traffic) : "belum ada"} onChange={(v) => set((x) => ({ ...x, traffic: { ...x.traffic, prev: v } }))} />}
                  </div>
                </Sec>
              )}

              {!weekly && isOn("npi") && (
                <Sec title="NPI" badge={<Manual />} note="hapus centang slide NPI = tidak ikut">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <TextField label="Judul baris 1" value={m.npi.title1} onChange={(v) => set((x) => ({ ...x, npi: { ...x.npi, title1: v } }))} />
                    <TextField label="Judul baris 2" value={m.npi.title2} onChange={(v) => set((x) => ({ ...x, npi: { ...x.npi, title2: v } }))} />
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="text-[13px]">
                      <thead>
                        <tr>
                          <th className="pr-2 text-left"><input className="sd-input !py-1" style={{ width: 140 }} value={m.npi.period} placeholder="Periode, mis. 16-18 Okt" onChange={(e) => set((x) => ({ ...x, npi: { ...x.npi, period: e.target.value } }))} /></th>
                          <th className="px-1"><input className="sd-input !py-1" style={{ width: 96 }} value={m.npi.colA} onChange={(e) => set((x) => ({ ...x, npi: { ...x.npi, colA: e.target.value } }))} /></th>
                          <th className="px-1"><input className="sd-input !py-1" style={{ width: 96 }} value={m.npi.colB} onChange={(e) => set((x) => ({ ...x, npi: { ...x.npi, colB: e.target.value } }))} /></th>
                          <th className="px-2 text-right text-slate-500">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.npi.rows.map((r, i) => (
                          <tr key={i}>
                            <td className="py-0.5 pr-2"><input className="sd-input !py-1" style={{ width: 140 }} value={r.label} onChange={(e) => set((x) => { x.npi.rows[i].label = e.target.value; return x; })} /></td>
                            <td className="px-1"><NumInput value={r.a} onChange={(v) => set((x) => { x.npi.rows[i].a = v; return x; })} /></td>
                            <td className="px-1"><NumInput value={r.b} onChange={(v) => set((x) => { x.npi.rows[i].b = v; return x; })} /></td>
                            <td className="px-2 text-right font-bold tabular-nums">{(r.a ?? 0) + (r.b ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <TextField label="Tabel kanan (opsional), mis. NPI iPhone Duo" value={m.npi.duoTitle} onChange={(v) => set((x) => ({ ...x, npi: { ...x.npi, duoTitle: v } }))} />
                  </div>
                  {m.npi.duoTitle.trim() && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {m.npi.duo.map((r, i) => (
                        <div key={i} className="flex items-end gap-1">
                          <TextField label={`Baris ${i + 1}`} value={r.label} onChange={(v) => set((x) => { x.npi.duo[i].label = v; return x; })} />
                          <NumInput value={r.unit} onChange={(v) => set((x) => { x.npi.duo[i].unit = v; return x; })} />
                        </div>
                      ))}
                      <NumField label="Sudah Pickup" value={m.npi.pickup} onChange={(v) => set((x) => ({ ...x, npi: { ...x.npi, pickup: v } }))} />
                      <div className="flex items-end gap-1">
                        <TextField label="Label unboxing" value={m.npi.unboxingLabel} onChange={(v) => set((x) => ({ ...x, npi: { ...x.npi, unboxingLabel: v } }))} />
                        <NumInput value={m.npi.unboxing} onChange={(v) => set((x) => ({ ...x, npi: { ...x.npi, unboxing: v } }))} />
                      </div>
                    </div>
                  )}
                </Sec>
              )}

              {!weekly && isOn("bnpl") && (
                <Sec title="Kontribusi BNPL" badge={d.bnpl.value ? <><Auto /> <Manual text="+ PER TIPE OPSIONAL" /></> : <Manual text="ISI MANUAL" />} note={d.bnpl.value ? "value & kontrak dari menu BNPL (bisa dikoreksi)" : "menu BNPL bulan ini kosong — ketik di sini"}>
                  <div className="overflow-x-auto">
                    <table className="text-[13px]">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="pr-3">BNPL</th>
                          <th className="px-1 text-right">Value (Rp)</th>
                          <th className="px-1 text-right">Kontrak</th>
                          <th className="px-1"><input className="sd-input !py-1" style={{ width: 84 }} value={m.bnpl.colA} onChange={(e) => set((x) => ({ ...x, bnpl: { ...x.bnpl, colA: e.target.value } }))} /></th>
                          <th className="px-1"><input className="sd-input !py-1" style={{ width: 84 }} value={m.bnpl.colB} onChange={(e) => set((x) => ({ ...x, bnpl: { ...x.bnpl, colB: e.target.value } }))} /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.bnpl.rows.map((r) => {
                          const cur = m.bnpl.per[r.provider] ?? { a: null, b: null };
                          const put = (patch: Partial<typeof cur>) => set((x) => { x.bnpl.per[r.provider] = { ...(x.bnpl.per[r.provider] ?? { a: null, b: null }), ...patch }; return x; });
                          return (
                            <tr key={r.provider}>
                              <td className="pr-3 font-semibold whitespace-nowrap">{r.label}</td>
                              <td className="px-1 py-0.5"><NumInput width={130} value={cur.value ?? null} placeholder={r.value ? rp(r.value) : "0"} onChange={(v) => put({ value: v })} /></td>
                              <td className="px-1"><NumInput width={70} value={cur.qty ?? null} placeholder={String(r.qty || 0)} onChange={(v) => put({ qty: v })} /></td>
                              <td className="px-1"><NumInput value={cur.a} onChange={(v) => put({ a: v })} /></td>
                              <td className="px-1"><NumInput value={cur.b} onChange={(v) => put({ b: v })} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="mt-1 text-[11px] text-slate-500">Kosong = pakai angka menu BNPL (abu-abu). Kolom per tipe boleh dikosongkan — kalau kosong semua, kolomnya tidak ditampilkan.</p>
                  </div>
                </Sec>
              )}

              {show("stock") && d.stockOut && <StockSec d={d} f={m.stock} onChange={(f) => set((x) => ({ ...x, stock: f }))} />}

              {weekly && wk && wOn("issue") && (
                <Sec title={`Issue & Feedback ${wk.label}`} badge={<><Auto text="ISSUE OTOMATIS" /> <Manual text="FEEDBACK DIKETIK" /></>} note="1 baris = 1 bullet">
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.25fr]">
                        <textarea className="sd-input min-h-24 font-sans !text-[12px]" value={m.wIssues[i] || wk.issues[i] || ""} onChange={(e) => set((x) => { x.wIssues[i] = e.target.value === wk.issues[i] ? "" : e.target.value; return x; })} />
                        <textarea className="sd-input min-h-24 font-sans !text-[13px]" value={m.wFeedback[i]} placeholder="Analisa & feedback…" onChange={(e) => set((x) => { x.wFeedback[i] = e.target.value; return x; })} />
                      </div>
                    ))}
                  </div>
                </Sec>
              )}

              {!weekly && isOn("issue") && (
                <Sec title="Issue & Feedback" badge={<><Auto text="ISSUE OTOMATIS" /> <Manual text="FEEDBACK DIKETIK" /></>} note="1 baris = 1 bullet">
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.25fr]">
                        <textarea className="sd-input min-h-24 font-sans !text-[12px]" value={m.issues[i] || d.issues[i] || ""} onChange={(e) => set((x) => { x.issues[i] = e.target.value === d.issues[i] ? "" : e.target.value; return x; })} />
                        <textarea className="sd-input min-h-24 font-sans !text-[13px]" value={m.feedback[i]} placeholder="Analisa & feedback…" onChange={(e) => set((x) => { x.feedback[i] = e.target.value; return x; })} />
                      </div>
                    ))}
                  </div>
                </Sec>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/60">
          <span className={`text-[12px] ${msg ? (msg.ok ? "font-semibold text-emerald-700" : "font-semibold text-rose-600") : "text-slate-500"}`}>{busy ?? msg?.text ?? "Isian manual tersimpan otomatis untuk bulan ini."}</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="sd-btn" onClick={onClose}>
              Tutup
            </button>
            <button type="button" className="sd-btn" disabled={!d || !m || !!busy || !count} onClick={() => void download("pdf")}>
              <FileDown size={16} aria-hidden /> Download PDF
            </button>
            <button type="button" className="sd-btn dark" disabled={!d || !m || !!busy || !count} onClick={() => void download("pptx")}>
              <FileDown size={16} aria-hidden /> {busy ? "Memproses…" : "Download PPT"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Filter of the "Stock kosong" slide: days empty, minimum sold, best N per brand, brands. */
function StockSec({ d, f, onChange }: { d: ReportData; f: StockFilter; onChange: (f: StockFilter) => void }) {
  const groups = stockRows(d, f);
  const items = groups.reduce((a, g) => a + g.items.length, 0);
  // per-brand count with the day / sold filter but ignoring the brand toggles
  const all = stockRows(d, { ...f, hide: [], perBrand: 0 });
  const countOf = new Map(all.map((g) => [g.category, g.items.length]));
  const brands = (d.stockOut?.groups ?? []).map((g) => g.category);
  const put = (patch: Partial<StockFilter>) => onChange({ ...f, ...patch });
  const Chips = ({ label, value, options, unit, onPick }: { label: string; value: number; options: number[]; unit: (n: number) => string; onPick: (n: number) => void }) => (
    <div>
      <span className="sd-label">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => onPick(n)} className={`rounded-lg border px-2.5 py-1 text-[12px] font-bold ${value === n ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"}`}>
            {unit(n)}
          </button>
        ))}
      </div>
    </div>
  );
  const dm = (x: string) => `${x.slice(8, 10)}/${x.slice(5, 7)}`;
  const so = d.stockOut!;
  return (
    <Sec title="Stock kosong per brand" badge={<><Auto /> <Manual text="FILTER" /></>} note={`SOH ${dm(so.sohDate)} · laku ${dm(so.from)}–${dm(so.to)}`}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Chips label="Kosong minimal" value={f.minDays} options={[3, 7, 14, 21, 30]} unit={(n) => (n % 7 === 0 ? `${n / 7} minggu` : `${n} hari`)} onPick={(n) => put({ minDays: n })} />
        <Chips label="Terjual 30 hari minimal" value={f.minSold} options={[1, 2, 3, 5]} unit={(n) => `${n} unit`} onPick={(n) => put({ minSold: n })} />
        <Chips label="Per brand" value={f.perBrand} options={[0, 3, 5, 10]} unit={(n) => (n ? `top ${n}` : "semua")} onPick={(n) => put({ perBrand: n })} />
      </div>
      <div className="mt-3">
        <span className="sd-label">Brand (klik untuk sembunyikan)</span>
        <div className="flex flex-wrap gap-1.5">
          {brands.map((b) => {
            const on = !f.hide.includes(b);
            const n = countOf.get(b) ?? 0;
            return (
              <button key={b} type="button" aria-pressed={on} disabled={!n} onClick={() => put({ hide: on ? [...f.hide, b] : f.hide.filter((x) => x !== b) })} className={`rounded-lg border px-2.5 py-1 text-[12px] font-bold disabled:opacity-40 ${on && n ? "border-slate-500 bg-slate-500 text-white" : "border-slate-200 text-slate-400 line-through"}`}>
                {b} <span className="opacity-75">{n}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {items} artikel · {groups.length} brand · ±{stockSlides(groups)} slide
        </span>
        <button type="button" className="font-semibold text-blue-600 hover:underline" onClick={() => onChange({ ...STOCK_FILTER })}>
          Reset filter
        </button>
      </div>
    </Sec>
  );
}

function Sec({ title, badge, note, children }: { title: string; badge?: ReactNode; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-3 sm:p-4 dark:border-slate-700">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[14px] font-extrabold text-slate-900 dark:text-white">{title}</h3>
        {badge}
        {note && <span className="ml-auto text-[11px] font-semibold text-slate-400">{note}</span>}
      </div>
      {children}
    </section>
  );
}
const Auto = ({ text = "OTOMATIS" }: { text?: string }) => <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{text}</span>;
const Manual = ({ text = "MANUAL" }: { text?: string }) => <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-extrabold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">{text}</span>;

function NumInput({ value, onChange, placeholder, width = 84 }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; width?: number }) {
  return <input inputMode="numeric" className="sd-input !py-1 text-right tabular-nums" style={{ width }} value={fmt(value)} placeholder={placeholder ?? "0"} onChange={(e) => onChange(numIn(e.target.value))} />;
}
function NumField({ label, value, onChange, placeholder }: { label: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <label className="block text-[13px]">
      <span className="sd-label">{label}</span>
      <input inputMode="numeric" className="sd-input text-right tabular-nums" style={{ width: 140 }} value={fmt(value)} placeholder={placeholder ?? "0"} onChange={(e) => onChange(numIn(e.target.value))} />
    </label>
  );
}
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-[13px]">
      <span className="sd-label">{label}</span>
      <input className="sd-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
