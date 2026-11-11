"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Download, FileStack, Loader2, Pencil, RefreshCw, X } from "lucide-react";
import { drawTicket, loadTicketFonts, type SlotDraw } from "@/lib/priceTicket/draw";
import { buildPdf, type PdfPage } from "@/lib/priceTicket/pdf";
import { monthly, rupiah } from "@/lib/domain/priceTicket";
import { isTextSlot, type ResolvedSlot, type TicketTemplate } from "@/types/priceTicket";

export interface TicketData {
  tpl: TicketTemplate;
  slots: ResolvedSlot[];
}

/** Manual price per slot ("ticketId|slotIndex"). */
type Overrides = Record<string, { price: number; strike?: number }>;

const PREVIEW = 720;
const imgs = new Map<string, Promise<HTMLImageElement>>();
function loadImg(src: string) {
  let p = imgs.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => {
        imgs.delete(src);
        reject(new Error("Gambar desain gagal dimuat"));
      };
      i.src = src;
    });
    imgs.set(src, p);
  }
  return p;
}

const slotKey = (t: TicketTemplate, i: number) => `${t.id}|${i}`;

/** Monthly slots follow the price slot of the same variant (its manual price too); they are not listed on their own. */
const linkedTo = (t: TicketTemplate, i: number) => {
  const s = t.slots[i];
  if (!isTextSlot(s) || s.field !== "monthly") return -1;
  return t.slots.findIndex((x) => isTextSlot(x) && x.field === "price" && x.key === s.key);
};
const listed = (t: TicketTemplate, i: number) => {
  const s = t.slots[i];
  if (isTextSlot(s) && s.field === "monthly" && linkedTo(t, i) >= 0) return false;
  // the same variant printed twice (header + table): list it once
  return t.slots.findIndex((x) => x.key === s.key && (!isTextSlot(x) || !isTextSlot(s) || x.field === s.field)) === i;
};
/** Override that applies to slot i: its own, or (monthly / repeated price) the listed slot of the same variant. */
function overrideOf(t: TicketTemplate, ov: Overrides, i: number) {
  const own = ov[slotKey(t, i)];
  if (own) return own;
  const s = t.slots[i];
  const j = t.slots.findIndex((x, k) => listed(t, k) && x.key === s.key && (!isTextSlot(x) || x.field === "price"));
  return j >= 0 && j !== i ? ov[slotKey(t, j)] : undefined;
}

/** What to draw for each slot: the design's pixels when the price did not change, else the new price. */
function draws(d: TicketData, ov: Overrides): SlotDraw[] {
  return d.tpl.slots.map((slot, i) => {
    const o = overrideOf(d.tpl, ov, i);
    const r = d.slots[i];
    if (isTextSlot(slot) && slot.field === "monthly") {
      // always the variant's (shown) price / 24 — also fixes a monthly amount mistyped in the design
      const j = linkedTo(d.tpl, i);
      const full = o?.price ?? (j >= 0 ? d.slots[j].price : (r.full ?? r.price * 24));
      const value = j >= 0 || o ? monthly(full) : r.price;
      return { slot, price: value, redraw: value !== slot.canva.price };
    }
    if (o && isTextSlot(slot)) return { slot, price: o.price, redraw: true };
    if (o) return { slot, price: o.price, strike: o.strike && o.strike > o.price ? o.strike : undefined, redraw: true };
    return { slot, price: r.price, strike: r.strike, redraw: r.status === "updated" };
  });
}

/** The ticket at the stored image's full resolution (≈ 300–550 dpi) as JPEG. */
async function jpegOf(d: TicketData, ov: Overrides): Promise<{ jpeg: Uint8Array; px: number; py: number }> {
  const [img] = await Promise.all([loadImg(d.tpl.image), loadTicketFonts()]);
  const c = document.createElement("canvas");
  drawTicket(c, img, d.tpl, img.naturalWidth, draws(d, ov));
  const px = c.width;
  const py = c.height;
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.95));
  c.width = c.height = 0;
  if (!blob) throw new Error("Gagal membuat gambar ticket");
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), px, py };
}

/** Characters a file name (and a WhatsApp caption taken from it) cannot carry. */
const fileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
/** "Samsung Galaxy A57 5G" — the brand in front unless the name already says it (Redmi is Xiaomi's own range). */
const itemName = (t: TicketTemplate) => (new RegExp(`^(${t.brand}|Redmi|iPhone|iPad|MacBook|iMac)\\b`, "i").test(t.name) ? t.name : `${t.brand} ${t.name}`);
function save(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** A4 portrait or landscape, whichever holds more tickets of this size (5 mm margin). */
function a4Grid(w: number, h: number) {
  const fit = (W: number, H: number) => ({ W, H, cols: Math.max(1, Math.floor((W - 10) / w)), rows: Math.max(1, Math.floor((H - 10) / h)) });
  const p = fit(210, 297);
  const l = fit(297, 210);
  return p.cols * p.rows >= l.cols * l.rows ? p : l;
}

/** All tickets: one page each at their real size, or A4 sheets with as many as fit (cut lines). */
async function pdfOf(list: TicketData[], ov: Overrides, layout: "single" | "a4", title: string): Promise<Uint8Array> {
  const images = [];
  for (const d of list) images.push(await jpegOf(d, ov));
  const pages: PdfPage[] = [];
  if (layout === "single") list.forEach((d, i) => pages.push({ w: d.tpl.size[0], h: d.tpl.size[1], items: [{ img: i, x: 0, y: 0, w: d.tpl.size[0], h: d.tpl.size[1] }] }));
  else {
    // tickets of the same size share sheets (grouped by size, original order kept within a size)
    const order = list.map((_, i) => i);
    const sizeKey = (d: TicketData) => d.tpl.size.join("x");
    const first = new Map<string, number>();
    list.forEach((d, i) => first.has(sizeKey(d)) || first.set(sizeKey(d), i));
    order.sort((a, b) => first.get(sizeKey(list[a]))! - first.get(sizeKey(list[b]))! || a - b);
    const at = (k: number) => list[order[k]];
    let i = 0;
    while (i < list.length) {
      const [w, h] = at(i).tpl.size;
      const g = a4Grid(w, h);
      const per = g.cols * g.rows;
      const batch: number[] = [];
      while (i < list.length && batch.length < per && at(i).tpl.size[0] === w && at(i).tpl.size[1] === h) batch.push(order[i++]);
      const mx = (g.W - g.cols * w) / 2;
      const my = (g.H - g.rows * h) / 2;
      pages.push({ w: g.W, h: g.H, items: batch.map((img, k) => ({ img, x: mx + (k % g.cols) * w, y: my + Math.floor(k / g.cols) * h, w, h, cut: true })) });
    }
  }
  return buildPdf(images, pages, title);
}

const cm = (mm: number) => String(mm / 10).replace(".", ",");
const sizeText = (t: TicketTemplate) => `${cm(t.size[0])}×${cm(t.size[1])} cm`;
/** Size as written in a file name ("10x16 cm") — plain x travels better in shared file names. */
const sizeFile = (t: TicketTemplate) => `${cm(t.size[0])}x${cm(t.size[1])} cm`;

function Preview({ d, ov }: { d: TicketData; ov: Overrides }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const list = useMemo(() => draws(d, ov), [d, ov]);
  useEffect(() => {
    let live = true;
    Promise.all([loadImg(d.tpl.image), loadTicketFonts()])
      .then(([img]) => live && ref.current && drawTicket(ref.current, img, d.tpl, PREVIEW, list))
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [d.tpl.image, list]);
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700" style={{ aspectRatio: `${d.tpl.frame[0]} / ${d.tpl.frame[1]}` }}>
      <canvas ref={ref} className="block h-full w-full" aria-label={`Price ticket ${d.tpl.name}`} />
      {err && <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm font-semibold text-rose-600">{err}</p>}
    </div>
  );
}

const STATUS = {
  same: { text: "Sesuai price list", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
  updated: { text: "Harga diperbarui", cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" },
  missing: { text: "Tidak ada di price list · harga desain", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" },
  manual: { text: "Harga manual", cls: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300" },
};

const digits = (s: string) => Number(s.replace(/\D/g, "")) || 0;

function SlotRow({ d, i, ov, setOv }: { d: TicketData; i: number; ov: Overrides; setOv: (f: (o: Overrides) => Overrides) => void }) {
  const r = d.slots[i];
  const k = slotKey(d.tpl, i);
  const o = ov[k];
  const [edit, setEdit] = useState(false);
  const [price, setPrice] = useState("");
  const [strike, setStrike] = useState("");
  const st = STATUS[o ? "manual" : r.status];
  const shown = o ?? { price: r.price, strike: r.strike };
  const slot = d.tpl.slots[i];
  const perMonth = isTextSlot(slot) && slot.field === "monthly";
  // an Apple price whose monthly amount is printed too
  const cicilan = isTextSlot(slot) && slot.field === "price" && d.tpl.slots.some((x) => isTextSlot(x) && x.field === "monthly" && x.key === slot.key);
  const open = () => {
    setPrice(String(shown.price));
    setStrike(shown.strike ? String(shown.strike) : "");
    setEdit(true);
  };
  const apply = () => {
    const p = digits(price);
    const s = digits(strike);
    if (p < 1000) return;
    setOv((x) => ({ ...x, [k]: { price: p, strike: s > p && d.tpl.slots[i].strikeRoom ? s : undefined } }));
    setEdit(false);
  };
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {r.label && <span className="text-xs font-bold text-slate-500">{r.label}</span>}
        <span className="font-black text-slate-950 tabular-nums">
          {rupiah(shown.price)}
          {perMonth && "/bln"}
        </span>
        {cicilan && <span className="text-xs text-slate-500 tabular-nums">cicilan {rupiah(monthly(shown.price))}/bln</span>}
        {shown.strike && <span className="text-xs text-slate-400 tabular-nums line-through">{rupiah(shown.strike)}</span>}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.text}</span>
        <span className="ml-auto flex gap-1">
          {o && (
            <button type="button" className="sd-btn ghost !px-2 !py-1 text-xs" onClick={() => setOv((x) => Object.fromEntries(Object.entries(x).filter(([kk]) => kk !== k)))} title="Kembali ke harga price list">
              <RefreshCw className="size-3.5" /> Reset
            </button>
          )}
          <button type="button" className="sd-btn ghost !px-2 !py-1 text-xs" onClick={edit ? () => setEdit(false) : open}>
            {edit ? <X className="size-3.5" /> : <Pencil className="size-3.5" />} {edit ? "Batal" : "Ubah"}
          </button>
        </span>
      </div>
      {r.match && !o && <p className="mt-0.5 truncate text-[11px] text-slate-400" title={r.match}>Price list: {r.match}</p>}
      {r.strikeDropped && !o && <p className="mt-1 text-[11px] font-semibold text-amber-600">Harga normal {rupiah(r.strikeDropped)} tidak dicoret — desain ini tidak punya tempat untuk harga coret.</p>}
      {edit && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <label className="text-xs font-bold text-slate-500">
            Harga jual
            <input className="sd-input mt-1 block w-36 tabular-nums" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
          </label>
          {d.tpl.slots[i].strikeRoom && (
            <label className="text-xs font-bold text-slate-500">
              Harga coret (opsional)
              <input className="sd-input mt-1 block w-36 tabular-nums" inputMode="numeric" value={strike} onChange={(e) => setStrike(e.target.value)} />
            </label>
          )}
          <button className="sd-btn primary" type="submit">Pakai</button>
          <p className="w-full text-[11px] text-slate-400">Hanya untuk download ini — tidak menyimpan ke price list.</p>
        </form>
      )}
    </li>
  );
}

/** Price tickets per brand: preview, prices from the price list, PDF per ticket / all (real size, or A4 sheets). */
export function PriceTicketApp({ tickets, listDate }: { tickets: TicketData[]; listDate: string | null }) {
  const brands = useMemo(() => [...new Set(tickets.map((t) => t.tpl.brand))], [tickets]);
  const [brand, setBrand] = useState(brands[0] ?? "");
  const [ov, setOv] = useState<Overrides>({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  /** Tickets ticked for the A4 sheet (ids, any brand). */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const list = tickets.filter((t) => t.tpl.brand === brand);
  const changed = list.filter((t) => t.slots.some((s) => s.status === "updated")).length;
  const missing = list.filter((t) => t.slots.some((s) => s.status === "missing")).length;
  const open = detail ? tickets.find((t) => t.tpl.id === detail) ?? null : null;
  const sizes = [...new Set(list.map((t) => sizeText(t.tpl)))].join(" / ");
  const chosen = tickets.filter((t) => picked.has(t.tpl.id));
  const chosenBrands = [...new Set(chosen.map((t) => t.tpl.brand))];
  const pickedHere = list.filter((t) => picked.has(t.tpl.id)).length;
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pickAll = (on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      list.forEach((t) => (on ? n.add(t.tpl.id) : n.delete(t.tpl.id)));
      return n;
    });
  const a4Name = chosen.length ? `Price Ticket ${chosenBrands.length === 1 ? chosenBrands[0] + " " : ""}pilihan (A4)` : `Price Ticket ${brand} (A4)`;

  /** `name` without extension: the PDF's file name (the caption when it is shared) and its title. */
  const run = async (id: string, items: TicketData[], layout: "single" | "a4", name: string) => {
    setBusy(id);
    setErr("");
    try {
      const title = fileName(name);
      save(await pdfOf(items, ov, layout, title), `${title}.pdf`);
    } catch (e) {
      setErr((e as Error).message || "PDF gagal dibuat");
    } finally {
      setBusy("");
    }
  };

  if (!tickets.length) return <p className="text-sm text-slate-500">Belum ada desain price ticket.</p>;
  return (
    <div className="space-y-4">
      <section className="sd-panel space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Brand">
          {brands.map((b) => (
            <button key={b} type="button" role="tab" aria-selected={b === brand} onClick={() => setBrand(b)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${b === brand ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
              {b} <span className="opacity-70">· {tickets.filter((t) => t.tpl.brand === b).length}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-500">
          Harga diambil dari Price List{listDate ? ` (${listDate})` : ""} — harga promo tampil dengan harga normal dicoret. {changed > 0 && <b className="text-blue-700 dark:text-blue-300">{changed} ticket harganya diperbarui. </b>}
          {missing > 0 && <b className="text-amber-700 dark:text-amber-300">{missing} ticket punya varian yang tidak ada di price list (pakai harga desain).</b>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="sd-btn primary" disabled={!!busy} onClick={() => run("all", list, "single", `Price Ticket ${brand} (${[...new Set(list.map((t) => sizeFile(t.tpl)))].join(", ")})`)}>
            {busy === "all" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Download semua ({sizes})
          </button>
          <button type="button" className="sd-btn" disabled={!!busy} onClick={() => run("a4", chosen.length ? chosen : list, "a4", a4Name)}>
            {busy === "a4" ? <Loader2 className="size-4 animate-spin" /> : <FileStack className="size-4" />} {chosen.length ? `Download A4 · ${chosen.length} ticket dipilih` : `Download A4 (semua ${brand})`}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>Centang ticket di bawah untuk digabung jadi A4{chosenBrands.length > 1 ? ` (bisa beda brand: ${chosenBrands.join(", ")})` : ""}.</span>
          <button type="button" className="font-bold text-blue-600 hover:underline" onClick={() => pickAll(pickedHere < list.length)}>
            {pickedHere < list.length ? `Pilih semua ${brand}` : `Hapus pilihan ${brand}`}
          </button>
          {chosen.length > 0 && (
            <button type="button" className="font-bold text-slate-500 hover:underline" onClick={() => setPicked(new Set())}>
              Kosongkan pilihan ({chosen.length})
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-400">Saat print, pilih ukuran asli / skala 100% (jangan &quot;Fit to page&quot;) supaya ukuran ticket tepat {sizes}.</p>
        {err && <div className="alert error" role="alert">{err}</div>}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((d) => (
          <article key={d.tpl.id} className={`sd-panel flex flex-col gap-3 p-3 sm:p-4 ${picked.has(d.tpl.id) ? "ring-2 ring-blue-500" : ""}`}>
            <div className="relative">
              <Preview d={d} ov={ov} />
              <label className="absolute left-1.5 top-1.5 flex cursor-pointer items-center gap-1 rounded-full bg-white/80 py-0.5 pl-0.5 pr-1.5 text-[9px] font-bold leading-none text-slate-500 ring-1 ring-slate-200/80 backdrop-blur" title="Centang untuk digabung jadi A4">
                <input
                  type="checkbox"
                  className="size-3 shrink-0 cursor-pointer appearance-none rounded-full border border-slate-400 bg-white transition checked:border-blue-600 checked:bg-blue-600 checked:shadow-[inset_0_0_0_2px_#fff] focus-visible:outline-2 focus-visible:outline-blue-500"
                  checked={picked.has(d.tpl.id)}
                  onChange={() => toggle(d.tpl.id)}
                  aria-label={`Pilih ${d.tpl.name} untuk A4`}
                />
                A4
              </label>
            </div>
            <div className="flex items-start gap-2">
              <h3 className="flex-1 text-base font-black text-slate-950">{d.tpl.name}</h3>
              {d.slots.every((s) => s.status === "same") ? <CheckCircle2 className="size-5 text-emerald-500" aria-label="Sesuai price list" /> : d.slots.some((s) => s.status === "missing") ? <AlertTriangle className="size-5 text-amber-500" aria-label="Ada varian di luar price list" /> : null}
            </div>
            <button type="button" className="sd-btn ghost -mt-1 justify-between !px-3 text-sm" onClick={() => setDetail(d.tpl.id)} aria-haspopup="dialog">
              <span className="flex flex-wrap items-center gap-1.5">
                Detail harga <span className="text-slate-400">· {d.tpl.slots.filter((_, i) => listed(d.tpl, i)).length} varian</span>
                <Summary d={d} ov={ov} />
              </span>
              <ChevronRight className="size-4 shrink-0 text-slate-400" />
            </button>
            <button type="button" className="sd-btn primary mt-auto justify-center" disabled={!!busy} onClick={() => run(d.tpl.id, [d], "single", `${itemName(d.tpl)} (${sizeFile(d.tpl)})`)}>
              {busy === d.tpl.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} PDF {sizeText(d.tpl)}
            </button>
          </article>
        ))}
      </div>
      {open && (
        <DetailDialog d={open} ov={ov} setOv={setOv} onClose={() => setDetail(null)}>
          <button type="button" className="sd-btn primary w-full justify-center" disabled={!!busy} onClick={() => run(open.tpl.id, [open], "single", `${itemName(open.tpl)} (${sizeFile(open.tpl)})`)}>
            {busy === open.tpl.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} PDF {sizeText(open.tpl)}
          </button>
        </DetailDialog>
      )}
    </div>
  );
}

/** Counts of the listed prices by status, as small chips (manual prices count as "manual"). */
function Summary({ d, ov }: { d: TicketData; ov: Overrides }) {
  const n = { updated: 0, missing: 0, manual: 0 };
  d.tpl.slots.forEach((_, i) => {
    if (!listed(d.tpl, i)) return;
    if (ov[slotKey(d.tpl, i)]) n.manual++;
    else if (d.slots[i].status !== "same") n[d.slots[i].status as "updated" | "missing"]++;
  });
  const chip = (k: keyof typeof n, text: string) => n[k] > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[k].cls}`}>{n[k]} {text}</span>;
  if (!n.updated && !n.missing && !n.manual) return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS.same.cls}`}>Sesuai price list</span>;
  return (
    <>
      {chip("updated", "diperbarui")}
      {chip("missing", "tidak ada di price list")}
      {chip("manual", "manual")}
    </>
  );
}

/** Pop-up with a ticket's prices: preview, every variant, manual edit and its PDF. Closes on Esc / backdrop / X. */
function DetailDialog({ d, ov, setOv, onClose, children }: { d: TicketData; ov: Overrides; setOv: (f: (o: Overrides) => Overrides) => void; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    const body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = body;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Detail harga ${d.tpl.name}`} className="sd-panel flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-b-none sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="flex-1 text-base font-black text-slate-950">{d.tpl.name}</h3>
          <button type="button" className="sd-btn ghost !p-1.5" onClick={onClose} aria-label="Tutup">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-4 py-3">
          <div className="mx-auto max-w-xs">
            <Preview d={d} ov={ov} />
          </div>
          {d.tpl.note && <p className="text-[11px] font-semibold text-amber-600">{d.tpl.note}</p>}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">{d.slots.map((_, i) => listed(d.tpl, i) && <SlotRow key={i} d={d} i={i} ov={ov} setOv={setOv} />)}</ul>
        </div>
        <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">{children}</div>
      </div>
    </div>
  );
}
