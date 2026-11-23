"use client";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Search, Store, Upload, X } from "lucide-react";
import { isDraWorkbook, parseDraWorkbook } from "@/lib/parsers/dra";
import type { DraSnapshot } from "@/types/dra";
import { loadSheetJS } from "./ImportRawForm";
import { postJson } from "./postJson";

const nf = new Intl.NumberFormat("id-ID");
const fmt = (n: number) => nf.format(n);
const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const dmy = (d: string | null) => (d ? `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "–");
const PAGE = 150;
/**
 * Device = what the dashboard counts as a device: Apple iPhone · iPad · Mac · Apple Watch, and Android phones,
 * tablets and watches. Not: AirPods / EarPods (ACC), cases, bands, chargers, keyboards, pencils, AirTag,
 * Studio Display, Apple Care, power banks, Shark / Ninja appliances, free gifts, Non MD.
 */
const APPLE_DEVICE = /^(i\s?phone|ipad|mba\b|mbp\b|mbn\b|mb$|imac|mac\b|apple watch|cto$)/i;
const NOT_DEVICE = /free gift|power bank|band apple|strap|case|charger|connector/i;
const isDevice = (sub: string, brand: string, kind: 0 | 1) =>
  kind === 0 ? APPLE_DEVICE.test(sub.trim()) && !NOT_DEVICE.test(sub) : !!brand && !/^shark|^non md$/i.test(brand) && !NOT_DEVICE.test(sub);
const ALL = "__all";

type Kind = "all" | "apple" | "android";
type SortKey = "sales" | "stock" | "netSales" | "netStock" | "stores" | "article";
interface Art {
  i: number;
  article: string;
  desc: string;
  sub: string;
  brand: string;
  kind: 0 | 1;
  netSales: number;
  netStock: number;
  /** stores holding stock */
  stores: number;
  /** per-store lines known (false = Apple accessory, network total only) */
  perStore: boolean;
  device: boolean;
  text: string;
}

/** Weekly DRA: search & filter network stock and sales per article, focused on one store. */
export function DraApp({ dra, isAdmin, storeCode }: { dra: DraSnapshot | null; isAdmin: boolean; storeCode: string }) {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim().toLowerCase());
  const [kind, setKind] = useState<Kind>("all");
  const [brand, setBrand] = useState("");
  const [sub, setSub] = useState("");
  const ownSite = useMemo(() => (dra ? dra.sites.findIndex((s) => s.split(" ")[0].toUpperCase() === storeCode.toUpperCase()) : -1), [dra, storeCode]);
  const [site, setSite] = useState<number | typeof ALL>(ownSite >= 0 ? ownSite : ALL);
  const [hasStock, setHasStock] = useState(false);
  const [hasSales, setHasSales] = useState(false);
  const [deviceOnly, setDeviceOnly] = useState(false);
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "sales", desc: true });
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);

  // per article aggregates + per (site, article) lines
  const base = useMemo(() => {
    if (!dra) return null;
    const arts: Art[] = dra.arts.map(([article, desc, subLob, br, k], i) => ({ i, article, desc, sub: subLob, brand: br, kind: k, netSales: 0, netStock: 0, stores: 0, perStore: false, device: isDevice(subLob, br, k), text: `${article} ${desc} ${subLob} ${br}`.toLowerCase() }));
    const bySite = new Map<number, Map<number, [number, number]>>();
    const byArt = new Map<number, Array<[number, number, number]>>();
    const r = dra.rows;
    for (let j = 0; j < r.length; j += 4) {
      const [s, a, qty, stk] = [r[j], r[j + 1], r[j + 2], r[j + 3]];
      const x = arts[a];
      x.netSales += qty;
      x.netStock += stk;
      if (s < 0) continue;
      x.perStore = true;
      if (stk > 0) x.stores++;
      let m = bySite.get(s);
      if (!m) bySite.set(s, (m = new Map()));
      m.set(a, [qty, stk]);
      const l = byArt.get(a) ?? [];
      l.push([s, qty, stk]);
      byArt.set(a, l);
    }
    return { arts, bySite, byArt };
  }, [dra]);

  const one = site !== ALL ? base?.bySite.get(site) : undefined;
  const brands = useMemo(() => (base ? [...new Set(base.arts.filter((a) => kind === "all" || a.kind === (kind === "apple" ? 0 : 1)).map((a) => a.brand))].filter(Boolean).sort() : []), [base, kind]);
  const subs = useMemo(() => (base ? [...new Set(base.arts.filter((a) => (kind === "all" || a.kind === (kind === "apple" ? 0 : 1)) && (!brand || a.brand === brand)).map((a) => a.sub))].filter(Boolean).sort((a, b) => a.localeCompare(b)) : []), [base, kind, brand]);
  const subsShown = deviceOnly && base ? subs.filter((x) => base.arts.some((a) => a.sub === x && a.device)) : subs;

  const list = useMemo(() => {
    if (!base) return [];
    const words = dq.split(/\s+/).filter(Boolean);
    const out = base.arts
      .map((a) => {
        const l = one?.get(a.i);
        return { ...a, sales: site === ALL ? a.netSales : (l?.[0] ?? 0), stock: site === ALL ? a.netStock : (l?.[1] ?? 0) };
      })
      .filter((a) => {
        if (kind !== "all" && a.kind !== (kind === "apple" ? 0 : 1)) return false;
        if (brand && a.brand !== brand) return false;
        if (sub && a.sub !== sub) return false;
        if (site !== ALL && !a.perStore) return false;
        if (deviceOnly && !a.device) return false;
        if (hasStock && a.stock <= 0) return false;
        if (hasSales && a.sales <= 0) return false;
        if (site !== ALL && !a.sales && !a.stock && !words.length) return false;
        return words.every((w) => a.text.includes(w));
      });
    const { k, desc } = sort;
    out.sort((x, y) => (k === "article" ? x.article.localeCompare(y.article) : (x[k] as number) - (y[k] as number)) * (desc ? -1 : 1) || y.netSales - x.netSales || x.article.localeCompare(y.article));
    return out;
  }, [base, one, site, kind, brand, sub, deviceOnly, hasStock, hasSales, dq, sort]);

  const tot = useMemo(() => list.reduce((t, a) => ({ sales: t.sales + a.sales, stock: t.stock + a.stock, netSales: t.netSales + a.netSales, netStock: t.netStock + a.netStock }), { sales: 0, stock: 0, netSales: 0, netStock: 0 }), [list]);

  if (!dra || !base) {
    return (
      <div className="space-y-4">
        <div className="sd-panel p-5 text-sm text-slate-600 dark:text-slate-300">Belum ada data DRA. {isAdmin ? "Upload file Excel DRA mingguan di bawah." : "Minta admin meng-upload file DRA mingguan."}</div>
        {isAdmin && <DraUpload />}
      </div>
    );
  }

  const siteName = site === ALL ? "Semua toko" : dra.sites[site];
  const reset = () => {
    setQ("");
    setKind("all");
    setBrand("");
    setSub("");
    setHasStock(false);
    setHasSales(false);
    setDeviceOnly(false);
    setLimit(PAGE);
  };
  const th = (k: SortKey, label: string, cls = "n") => (
    <th className={cls}>
      <button type="button" onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : k !== "article" }))} className="inline-flex items-center gap-0.5 uppercase">
        {label}
        {sort.k === k && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );
  const chip = (on: boolean, label: string, click: () => void) => (
    <button key={label} type="button" onClick={click} aria-pressed={on} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${on ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>
      {label}
    </button>
  );
  const sel = "h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900";
  const shown = list.slice(0, limit);
  const filtered = !!(q || kind !== "all" || brand || sub || deviceOnly || hasStock || hasSales);

  return (
    <div className="space-y-4">
      {/* filters */}
      <section className="sd-panel space-y-3 p-3 sm:p-4" aria-label="Filter">
        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Cari artikel, nama produk, atau sub-LOB… (mis. iphone 17 pro 256)"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pr-9 pl-9 text-sm dark:border-slate-700 dark:bg-slate-900"
              aria-label="Cari"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-slate-400" aria-label="Hapus pencarian">
                <X className="size-4" />
              </button>
            )}
          </label>
          <label className="relative flex min-w-[13rem] items-center">
            <Store className="pointer-events-none absolute left-3 size-4 text-slate-400" />
            <select value={String(site)} onChange={(e) => setSite(e.target.value === ALL ? ALL : Number(e.target.value))} className={`${sel} w-full pl-9`} aria-label="Toko">
              <option value={ALL}>Semua toko (jaringan)</option>
              {dra.sites.map((s, i) => ({ s, i })).sort((a, b) => (a.i === ownSite ? -1 : b.i === ownSite ? 1 : a.s.localeCompare(b.s))).map(({ s, i }) => (
                <option key={i} value={i}>{s}{i === ownSite ? " (toko ini)" : ""}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "apple", "android"] as const).map((k) => chip(kind === k, k === "all" ? "Semua" : k === "apple" ? "Apple" : "Android", () => { setKind(k); setBrand(""); setSub(""); setLimit(PAGE); }))}
          {chip(deviceOnly, "Device", () => { setDeviceOnly((v) => !v); setSub(""); setLimit(PAGE); })}
          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          {kind !== "apple" && (
            <select value={brand} onChange={(e) => { setBrand(e.target.value); setSub(""); setLimit(PAGE); }} className={`${sel} h-8 !w-auto text-xs`} aria-label="Brand">
              <option value="">Semua brand</option>
              {brands.map((b) => <option key={b}>{b}</option>)}
            </select>
          )}
          <select value={sub} onChange={(e) => { setSub(e.target.value); setLimit(PAGE); }} className={`${sel} h-8 !w-auto max-w-[14rem] text-xs`} aria-label="Sub-LOB">
            <option value="">Semua sub-LOB</option>
            {subsShown.map((b) => <option key={b}>{b}</option>)}
          </select>
          {chip(hasStock, "Ada stok", () => { setHasStock((v) => !v); setLimit(PAGE); })}
          {chip(hasSales, "Ada penjualan", () => { setHasSales((v) => !v); setLimit(PAGE); })}
          {filtered && (
            <button type="button" onClick={reset} className="text-xs font-bold text-blue-600 hover:underline">Reset filter</button>
          )}
        </div>
      </section>

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Artikel", fmt(list.length), filtered ? "sesuai filter" : "semua artikel"],
          [`Terjual · ${site === ALL ? "jaringan" : dra.sites[site].split(" ")[0]}`, fmt(tot.sales), `minggu ${dra.week || "ini"}`],
          [`Stok · ${site === ALL ? "jaringan" : dra.sites[site].split(" ")[0]}`, fmt(tot.stock), `per ${dmy(dra.asOf)}`],
          ...(site === ALL ? [] : [["Jaringan", `${fmt(tot.netSales)} / ${fmt(tot.netStock)}`, "terjual / stok semua toko"]]),
        ].map(([k, v, d]) => (
          <article key={k} className="sd-block-card p-3.5 sm:p-4">
            <p className="text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">{k}</p>
            <p className="mt-1.5 text-xl font-black tabular-nums">{v}</p>
            <p className="text-[11px] font-semibold text-slate-500">{d}</p>
          </article>
        ))}
      </div>

      {/* phone: cards */}
      <div className="space-y-2 md:hidden">
        {shown.map((a) => (
          <button key={a.i} type="button" onClick={() => setOpen(a.i)} className="sd-panel block w-full p-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] leading-tight font-bold">{a.desc || a.sub || a.article}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">{a.article} · {a.sub}</p>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p className="text-[15px] font-black">{fmt(a.stock)} <span className="text-[10px] font-semibold text-slate-400">stok</span></p>
                <p className="text-[12px] font-bold text-emerald-600">{fmt(a.sales)} <span className="text-[10px] font-semibold text-slate-400">terjual</span></p>
              </div>
            </div>
            {site !== ALL && <p className="mt-1.5 text-[11px] text-slate-500">Jaringan: {fmt(a.netSales)} terjual · {fmt(a.netStock)} stok · {a.stores} toko ada stok</p>}
          </button>
        ))}
      </div>

      {/* desktop: table */}
      <div className="sd-panel hidden p-0 md:block">
        <div className="sd-table-wrap !rounded-2xl !border-0">
          <table className="sd-table">
            <thead>
              <tr>
                {th("article", "Artikel", "")}
                <th>Produk</th>
                {site !== ALL && th("sales", "Terjual")}
                {site !== ALL && th("stock", "Stok")}
                {th("netSales", site === ALL ? "Terjual" : "Terjual jaringan")}
                {th("netStock", site === ALL ? "Stok" : "Stok jaringan")}
                {th("stores", "Toko ada stok")}
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.i} onClick={() => setOpen(a.i)} className="cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-950/30">
                  <td className="font-mono text-[12px] whitespace-nowrap">{a.article}</td>
                  <td>
                    <span className="block leading-tight font-semibold">{a.desc || a.sub}</span>
                    <span className="text-[11px] text-slate-500">{a.sub}{a.kind === 1 && a.brand ? ` · ${a.brand}` : ""}</span>
                  </td>
                  {site !== ALL && <td className={`n tabular-nums ${a.sales ? "font-bold text-emerald-600" : "text-slate-300"}`}>{fmt(a.sales)}</td>}
                  {site !== ALL && <td className={`n tabular-nums ${a.stock ? "font-black" : "text-slate-300"}`}>{fmt(a.stock)}</td>}
                  <td className="n text-slate-600 tabular-nums dark:text-slate-300">{fmt(a.netSales)}</td>
                  <td className="n text-slate-600 tabular-nums dark:text-slate-300">{fmt(a.netStock)}</td>
                  <td className="n tabular-nums">{a.perStore ? <span className="text-blue-600">{a.stores} ›</span> : <span className="text-[11px] text-slate-400">total saja</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {!list.length && <p className="sd-panel p-5 text-center text-sm text-slate-500">Tidak ada artikel yang cocok{site !== ALL ? ` di ${siteName}` : ""}. Coba kata lain atau pilih &quot;Semua toko&quot;.</p>}
      {list.length > limit && (
        <div className="text-center">
          <button type="button" onClick={() => setLimit((l) => l + PAGE * 2)} className="sd-btn">Tampilkan lagi ({fmt(list.length - limit)} artikel)</button>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Sumber: {dra.source} · {dra.week} · data s/d {dmy(dra.asOf)} · {fmt(dra.sites.length)} toko. Ketuk artikel untuk melihat stok & penjualan di semua toko.
        {" "}Aksesoris Apple tertulis &quot;total saja&quot; karena di file hanya ada total jaringan.
      </p>

      {isAdmin && <DraUpload compact />}

      {open != null && <ArtDetail dra={dra} art={base.arts[open]} lines={base.byArt.get(open) ?? []} ownSite={ownSite} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** One article across all stores: who has stock, who sold it. */
function ArtDetail({ dra, art, lines, ownSite, onClose }: { dra: DraSnapshot; art: Art; lines: Array<[number, number, number]>; ownSite: number; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(true);
  const rows = lines
    .filter(([s, , k]) => (!only || k > 0 || s === ownSite) && dra.sites[s].toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a[0] === ownSite ? -1 : b[0] === ownSite ? 1 : b[2] - a[2] || b[1] - a[1]));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Detail ${art.article}`}>
      <div className="flex max-h-[88dvh] w-full max-w-xl flex-col rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-5 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base leading-tight font-black">{art.desc || art.sub}</p>
            <p className="mt-0.5 font-mono text-xs text-slate-500">{art.article} · {art.sub}{art.kind === 1 && art.brand ? ` · ${art.brand}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="sd-btn" aria-label="Tutup">✕</button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[["Terjual", art.netSales], ["Stok", art.netStock], ["Toko ada stok", art.stores]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-slate-800/60"><p className="text-[10.5px] font-bold text-slate-500 uppercase">{k}</p><p className="text-lg font-black tabular-nums">{fmt(v as number)}</p></div>
          ))}
        </div>
        {art.perStore ? (
          <>
            <div className="mt-3 flex items-center gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari toko…" className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" aria-label="Cari toko" />
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> hanya yang ada stok</label>
            </div>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 text-[13px] dark:border-slate-700">
              <div className="sticky top-0 grid grid-cols-[minmax(0,1fr)_3.6rem_3.6rem] gap-x-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10.5px] font-extrabold text-slate-500 uppercase dark:border-slate-700 dark:bg-slate-800">
                <span>Toko</span><span className="text-right">Terjual</span><span className="text-right">Stok</span>
              </div>
              {rows.map(([s, qty, stk]) => (
                <div key={s} className={`grid grid-cols-[minmax(0,1fr)_3.6rem_3.6rem] items-center gap-x-2 border-t border-slate-100 px-3 py-1.5 tabular-nums first:border-t-0 dark:border-slate-800 ${s === ownSite ? "bg-blue-50 font-bold dark:bg-blue-950/40" : ""}`}>
                  <span className="min-w-0 truncate">{dra.sites[s]}</span>
                  <span className={`text-right ${qty ? "font-bold text-emerald-600" : "text-slate-300"}`}>{fmt(qty)}</span>
                  <span className={`text-right ${stk ? "font-black" : "text-slate-300"}`}>{fmt(stk)}</span>
                </div>
              ))}
              {!rows.length && <p className="p-3 text-sm text-slate-500">Tidak ada toko yang cocok.</p>}
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-500">File DRA hanya berisi total jaringan untuk artikel ini (tanpa rincian per toko).</p>
        )}
      </div>
    </div>
  );
}

/** Admin: pick the weekly DRA Excel, parse it in the browser and store it. */
function DraUpload({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const run = async (f: File | null) => {
    if (!f) return;
    setState("busy");
    setMsg("Membaca Excel…");
    try {
      const XLSX = await loadSheetJS();
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
      const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true }) as unknown[][] }));
      if (!isDraWorkbook(sheets)) throw new Error('Bukan file DRA — sheet "apple by article" / "android by article" tidak ditemukan.');
      const pack = parseDraWorkbook(sheets, f.name);
      setMsg("Menyimpan…");
      const r = await postJson("/api/dra", pack);
      const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? `Gagal menyimpan (${r.status})`);
      setState("ok");
      setMsg(j.message ?? "Tersimpan");
      router.refresh();
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    } finally {
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className={`sd-panel flex flex-wrap items-center gap-3 ${compact ? "p-3" : "p-4"}`}>
      <input ref={input} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void run(e.target.files?.[0] ?? null)} />
      <button type="button" onClick={() => input.current?.click()} disabled={state === "busy"} className="sd-btn">
        {state === "busy" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload DRA (.xlsx)
      </button>
      <span className={`text-xs ${state === "error" ? "font-semibold text-rose-600" : state === "ok" ? "font-semibold text-emerald-600" : "text-slate-500"}`}>
        {msg || "Admin: upload file DRA mingguan (mis. \"MZA DRA Y27Q1W8 as of minggu 22 nov 2026.xlsx\") untuk mengganti data."}
      </span>
    </div>
  );
}
