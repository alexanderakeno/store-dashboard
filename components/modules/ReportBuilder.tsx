"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileDown, X } from "lucide-react";
import { SLIDES, type ReportData, type SlideId } from "@/lib/domain/report";
import { defaultManual, mergeManual, type ReportManual } from "@/lib/report/pptx";

type Loaded = { data: ReportData; manual: ReportManual };

const numIn = (v: string): number | null => {
  const n = Number(v.replace(/[^\d]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};
const fmt = (n: number | null | undefined) => (n == null ? "" : String(n));
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
  const count = useMemo(() => (m ? SLIDES.filter((s) => !m.skip.includes(s.id)).length : 0), [m]);

  async function download() {
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
    try {
      setBusy("Membuat PPT…");
      const [{ default: PptxGenJS }, { buildDeck, deckFileName }] = await Promise.all([import("pptxgenjs"), import("@/lib/report/pptx")]);
      const logo = await fetch("/report-logo.png")
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => (b ? new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b); }) : null))
        .catch(() => null);
      const deck = buildDeck(PptxGenJS, d, m, logo);
      await deck.writeFile({ fileName: deckFileName(d) });
      setMsg({ ok: true, text: `PPT terunduh (${count} slide).${saved ? "" : " Isian manual belum tersimpan — coba lagi nanti."}` });
    } catch (e) {
      setMsg({ ok: false, text: `Gagal membuat PPT: ${(e as Error).message}` });
    }
    setBusy(null);
  }

  const set = (f: (x: ReportManual) => ReportManual) => setM((x) => (x ? f(structuredClone(x)) : x));
  const toggle = (id: SlideId, on: boolean) => set((x) => ({ ...x, skip: on ? x.skip.filter((k) => k !== id) : [...new Set([...x.skip, id])] }));
  const isOn = (id: SlideId) => !!m && !m.skip.includes(id);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Buat PPT" className="flex max-h-[94dvh] w-full max-w-[880px] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-950 dark:text-white">
              Buat PPT{d ? ` — ${d.title}` : ""}
              {d && <span className={`ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-[11px] font-extrabold ${d.mode === "closing" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>{d.mode === "closing" ? "Bulan selesai → Closing" : "Bulan berjalan → Weekly"}</span>}
            </h2>
            {d && (
              <p className="mt-0.5 text-[13px] text-slate-500">
                Data dashboard s/d {Number(d.asOf.slice(8))} {d.monthName} {d.year}
                {d.hasPrev ? ` · dibanding ${d.prevLabel}` : " · bulan lalu belum ada datanya"}
                {d.hasLy ? ` · LFL ${d.lyShort}` : ""}
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
              <Sec title="Slide" badge={<Auto />} note={`${count} dari ${SLIDES.length} slide ikut`}>
                <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {SLIDES.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 py-0.5 text-[13px]">
                      <input type="checkbox" className="size-4 accent-blue-600" checked={isOn(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
                      <span className={isOn(s.id) ? "" : "text-slate-400 line-through"}>{s.label}</span>
                      {s.id === "npi" && <Manual />}
                      {s.id === "bnpl" && !d.bnpl.value && <span className="text-[11px] text-slate-400">(belum ada data BNPL)</span>}
                      {s.id === "ytd" && !d.ytd.some((r) => r.prev && r.cur) && <span className="text-[11px] text-slate-400">(data {d.ytdYears[0]} belum ada)</span>}
                    </label>
                  ))}
                </div>
              </Sec>

              {isOn("cover") && (
                <Sec title="Cover" badge={<Manual />}>
                  <label className="block max-w-md text-[13px]">
                    <span className="sd-label">Nama & NIK di cover</span>
                    <input className="sd-input" value={m.author} onChange={(e) => set((x) => ({ ...x, author: e.target.value }))} placeholder="Nama - NIK" />
                  </label>
                </Sec>
              )}

              {isOn("productivity") && (
                <Sec title="Traffic (slide Compare Productivity)" badge={d.productivity.cur.traffic ? <Auto /> : <Manual text="ISI JIKA KOSONG" />} note="kosongkan = pakai data traffic dashboard">
                  <div className="flex flex-wrap gap-3">
                    <NumField label={d.curLabel} value={m.traffic.cur} placeholder={d.productivity.cur.traffic ? rp(d.productivity.cur.traffic) : "belum ada"} onChange={(v) => set((x) => ({ ...x, traffic: { ...x.traffic, cur: v } }))} />
                    {d.productivity.prev && <NumField label={d.prevLabel} value={m.traffic.prev} placeholder={d.productivity.prev.traffic ? rp(d.productivity.prev.traffic) : "belum ada"} onChange={(v) => set((x) => ({ ...x, traffic: { ...x.traffic, prev: v } }))} />}
                  </div>
                </Sec>
              )}

              {isOn("npi") && (
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

              {isOn("bnpl") && (
                <Sec title="Kontribusi BNPL" badge={<><Auto /> <Manual text="+ PER TIPE OPSIONAL" /></>} note="value & kontrak dari menu BNPL">
                  {d.bnpl.rows.some((r) => r.value || r.qty) ? (
                    <div className="overflow-x-auto">
                      <table className="text-[13px]">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="pr-3">BNPL</th>
                            <th className="pr-3 text-right">Value</th>
                            <th className="pr-3 text-right">Kontrak</th>
                            <th className="px-1"><input className="sd-input !py-1" style={{ width: 90 }} value={m.bnpl.colA} onChange={(e) => set((x) => ({ ...x, bnpl: { ...x.bnpl, colA: e.target.value } }))} /></th>
                            <th className="px-1"><input className="sd-input !py-1" style={{ width: 90 }} value={m.bnpl.colB} onChange={(e) => set((x) => ({ ...x, bnpl: { ...x.bnpl, colB: e.target.value } }))} /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.bnpl.rows.filter((r) => r.value || r.qty).map((r) => (
                            <tr key={r.provider}>
                              <td className="pr-3 font-semibold">{r.label}</td>
                              <td className="pr-3 text-right tabular-nums">{rp(r.value)}</td>
                              <td className="pr-3 text-right tabular-nums">{r.qty}</td>
                              <td className="px-1 py-0.5"><NumInput value={m.bnpl.per[r.provider]?.a ?? null} onChange={(v) => set((x) => { x.bnpl.per[r.provider] = { a: v, b: x.bnpl.per[r.provider]?.b ?? null }; return x; })} /></td>
                              <td className="px-1"><NumInput value={m.bnpl.per[r.provider]?.b ?? null} onChange={(v) => set((x) => { x.bnpl.per[r.provider] = { a: x.bnpl.per[r.provider]?.a ?? null, b: v }; return x; })} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-1 text-[11px] text-slate-500">Kolom per tipe boleh dikosongkan — kalau kosong semua, kolomnya tidak ditampilkan.</p>
                    </div>
                  ) : (
                    <p className="text-[13px] text-slate-500">Belum ada data BNPL bulan ini (isi di menu BNPL & Trade-In), atau hapus centang slide ini.</p>
                  )}
                </Sec>
              )}

              {isOn("issue") && (
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
          <div className="flex gap-2">
            <button type="button" className="sd-btn" onClick={onClose}>
              Tutup
            </button>
            <button type="button" className="sd-btn dark" disabled={!d || !m || !!busy || !count} onClick={download}>
              <FileDown size={16} aria-hidden /> {busy ? "Memproses…" : "Download PPT"}
            </button>
          </div>
        </div>
      </div>
    </div>
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

function NumInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return <input inputMode="numeric" className="sd-input !py-1 text-right tabular-nums" style={{ width: 84 }} value={fmt(value)} placeholder={placeholder ?? "0"} onChange={(e) => onChange(numIn(e.target.value))} />;
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
