"use client";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { displayName, qoalaFor, type PriceModel } from "@/lib/domain/pricelist";
import type { VariantPromo } from "@/lib/domain/samsungPromo";
import type { QoalaTier } from "@/types/pricelist";

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const rp = (n: number) => `Rp\u00a0${nf.format(Math.round(n))}`;
const isEol = (s: string) => /EOL/i.test(s);

/** Keeps brand / model in the address bar (shareable, survives reload) without a server round trip. */
function syncUrl(patch: Record<string, string | null>) {
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  window.history.replaceState(window.history.state, "", u);
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] font-black tracking-[.12em] text-slate-500 uppercase">{children}</p>;
}

function Chip({ active, onClick, children, sub, tone = "dark" }: { active: boolean; onClick: () => void; children: React.ReactNode; sub?: React.ReactNode; tone?: "dark" | "blue" }) {
  const on = tone === "blue" ? "bg-blue-600 text-white shadow-sm" : "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900";
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-xl px-3 py-1.5 text-left text-sm font-bold transition sm:px-4 sm:py-2 ${active ? on : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
      <span className="block leading-tight">{children}</span>
      {sub != null && <span className={`block text-[10px] font-extrabold tracking-wide ${active ? "opacity-80" : "text-slate-400"}`}>{sub}</span>}
    </button>
  );
}

export function PriceBoard({ models, qoala, hasSoh, initialBrand, initialModel, promos = {}, today = "" }: { models: PriceModel[]; qoala: QoalaTier[]; hasSoh: boolean; initialBrand: string; initialModel: string; promos?: Record<string, VariantPromo>; today?: string }) {
  const brands = useMemo(() => [...new Set(models.map((m) => m.brand))], [models]);
  const [brand, setBrand] = useState(brands.includes(initialBrand) ? initialBrand : brands[0]);
  const [modelKey, setModelKey] = useState(models.some((m) => m.key === initialModel) ? initialModel : "");
  const [variantId, setVariantId] = useState("");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const card = useRef<HTMLElement>(null);

  const terms = q.toUpperCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  const shown = searching ? models.filter((m) => terms.every((t) => `${m.brand} ${m.model} ${m.variants.map((v) => v.variant).join(" ")}`.toUpperCase().includes(t))) : models.filter((m) => m.brand === brand);
  const model = shown.find((m) => m.key === modelKey) ?? shown[0];
  const variant = model?.variants.find((v) => v.id === variantId) ?? model?.variants.find((v) => !isEol(v.status)) ?? model?.variants[0];

  // types grouped by series, as printed in the PDF
  const bySeries = useMemo(() => {
    const out: Array<{ series: string; items: PriceModel[] }> = [];
    for (const m of shown) {
      const g = out.find((x) => x.series === m.series);
      if (g) g.items.push(m);
      else out.push({ series: m.series, items: [m] });
    }
    return out;
  }, [shown]);

  const pickBrand = (b: string) => {
    setBrand(b);
    setModelKey("");
    setVariantId("");
    setSearch("");
    syncUrl({ b, t: null });
  };
  const pickModel = (m: PriceModel) => {
    setModelKey(m.key);
    setVariantId("");
    if (searching) setBrand(m.brand);
    syncUrl({ b: m.brand, t: m.key });
    // phones: the price card sits below the type list — bring it into view
    if (window.innerWidth < 1024) setTimeout(() => card.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const save = variant ? variant.normal - variant.promo : 0;
  // Apple lists a separate installment price; Android uses the active price for both
  const credit = variant ? (variant.credit ?? variant.promo) : 0;
  const promo = !!variant && save > 0;
  const stock = variant?.stock ?? [];
  const totalSoh = stock.reduce((a, s) => a + s.qty, 0);
  const tier = variant ? qoalaFor(variant.promo, qoala) : null;
  const variantCount = (label: string) => model?.variants.filter((v) => v.variant === label).length ?? 0;

  return (
    <>
      <section className="space-y-2">
        <Label>Pilih Brand</Label>
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <Chip key={b} active={!searching && b === brand} onClick={() => pickBrand(b)}>
              {b} <span className="ml-0.5 text-xs opacity-60">{models.filter((m) => m.brand === b).length}</span>
            </Chip>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
      <section className="sd-panel space-y-4 p-4 sm:p-5">
        <form className="flex items-center gap-2" role="search" onSubmit={(e) => e.preventDefault()}>
          <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="sd-input flex-1" placeholder="Cari tipe atau kapasitas… (mis. S26 Ultra 512)" aria-label="Cari price list" />
          {search && <button type="button" className="sd-btn" onClick={() => setSearch("")} aria-label="Hapus pencarian"><X className="size-4" /></button>}
        </form>
        <div className="space-y-3">
          <Label>{searching ? `Hasil cari · ${shown.length} tipe` : "Pilih Tipe"}</Label>
          {bySeries.map((g) => (
            <div key={g.series}>
              {!searching && bySeries.length > 1 && <p className="mb-1.5 text-[11px] font-bold text-slate-400">{displayName(g.series)}</p>}
              <div className="flex flex-wrap gap-2">
                {g.items.map((m) => (
                  <Chip key={m.key} tone="blue" active={m.key === model?.key} onClick={() => pickModel(m)} sub={searching ? m.brand : undefined}>
                    {displayName(m.model)}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
          {!shown.length && <p className="text-sm text-slate-500">Tidak ada tipe yang cocok.</p>}
        </div>
      </section>

      {model && variant && (
        <section ref={card} className="sd-panel scroll-mt-20 space-y-4 p-4 sm:p-5 lg:sticky lg:top-20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black tracking-[.12em] text-blue-600 uppercase">{model.brand}{model.series !== model.brand ? ` · ${displayName(model.series)}` : ""}</p>
              <h2 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{displayName(model.model)}</h2>
              {variant.note && <p className="text-xs text-slate-500">{variant.note}</p>}
            </div>
            {isEol(variant.status) ? <span className="sd-badge slate shrink-0">EOL</span> : promo ? <span className="sd-badge green shrink-0">Promo Aktif</span> : <span className="sd-badge slate shrink-0">Harga Normal</span>}
          </div>

          {(model.variants.length > 1 || variant.variant !== "Standar") && (
            <div>
              <Label>Varian</Label>
              <div className="flex flex-wrap gap-2">
                {model.variants.map((v) => (
                  <Chip key={v.id} active={v.id === variant.id} onClick={() => setVariantId(v.id)} sub={isEol(v.status) ? "EOL" : variantCount(v.variant) > 1 ? rp(v.promo) : undefined}>
                    {v.variant}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {hasSoh && (
            <div>
              <Label>Warna · Stok</Label>
              {stock.length ? (
                <div className="flex flex-wrap gap-2">
                  {stock.map((s) => (
                    <div key={s.article} className={`rounded-xl px-3 py-1.5 ${s.qty > 0 ? "bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                      <p className="text-sm leading-tight font-bold">{displayName(s.color)}</p>
                      <p className="text-[10px] font-extrabold tracking-wide opacity-70">SOH {nf.format(s.qty)} · <span className="font-mono font-medium">{s.article}</span></p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Tidak ditemukan di data SOH.</p>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black tracking-[.12em] text-slate-500 uppercase">{promo ? "Promo Price" : "Harga"}</p>
                <p className="text-2xl font-black tracking-tight text-blue-600 sm:text-3xl">{rp(variant.promo)}</p>
                {promo && (
                  <>
                    <p className="text-sm text-slate-400 line-through">{rp(variant.normal)}</p>
                    <p className="text-sm font-bold text-emerald-600">Hemat {rp(save)} · {((save / variant.normal) * 100).toFixed(1).replace(".", ",")}%</p>
                  </>
                )}
                {variant.credit != null && variant.credit !== variant.promo && (
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Promo Cicilan {rp(variant.credit)}</p>
                )}
                {variant.promo > variant.normal && <p className="text-xs font-semibold text-amber-600">Harga promo di PDF lebih tinggi dari normal ({rp(variant.normal)}) — cek price list.</p>}
              </div>
              {hasSoh && (
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-black tracking-[.12em] text-slate-500 uppercase">Total SOH</p>
                  <p className="text-2xl font-black text-slate-950">{nf.format(totalSoh)}</p>
                  <p className={`text-xs font-bold ${totalSoh > 0 ? "text-emerald-600" : "text-rose-600"}`}>{totalSoh > 0 ? "Ready" : "Kosong"}</p>
                </div>
              )}
            </div>
            {promos[variant.id] && <PromoBox vp={promos[variant.id]} price={variant.promo} today={today} model={model.model} />}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-dashed border-slate-300 pt-3 dark:border-slate-600">
              {[12, 24].map((n) => (
                <div key={n}>
                  <p className="text-[11px] font-black tracking-[.12em] text-slate-500 uppercase">{n} Bulan</p>
                  <p className="font-black text-slate-950">{rp(credit / n)} <span className="text-xs font-semibold text-slate-400">/bln</span></p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Estimasi cicilan 0% dari {variant.credit != null ? "harga promo cicilan" : "harga aktif"}. Ketentuan bank mengikuti promo berjalan.</p>
            {tier && (
              <div className="mt-3 border-t border-dashed border-slate-300 pt-3 dark:border-slate-600">
                <p className="text-[11px] font-black tracking-[.12em] text-slate-500 uppercase">Qoala Protection · {tier.tier}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {Object.entries(tier.fees).map(([m, fee]) => (
                    <span key={m}><span className="text-slate-500">{m} bln</span> <b className="text-slate-950">{rp(fee)}</b></span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
      </div>

      {!searching && (
        <section className="sd-panel p-4 sm:p-5">
          <h2 className="text-base font-black text-slate-950">Semua harga {brand}</h2>
          <p className="mb-3 text-sm text-slate-500">Harga aktif · harga normal dicoret bila ada promo.</p>
          <div className="space-y-4">
            {bySeries.map((g) => (
              <div key={g.series} className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <p className="bg-slate-50 px-3 py-2 text-[11px] font-extrabold tracking-wider text-slate-500 uppercase dark:bg-slate-800/60">{g.series}</p>
                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                  {g.items.flatMap((m) =>
                    m.variants.map((v) => (
                      <li key={v.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${isEol(v.status) ? "opacity-50" : ""}`}>
                        <button type="button" className="min-w-0 text-left text-[13px] leading-snug font-semibold text-slate-800 hover:text-blue-600 dark:text-slate-100" onClick={() => { pickModel(m); setVariantId(v.id); setTimeout(() => card.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }}>
                          {v.name}
                          {isEol(v.status) && <span className="ml-1.5 text-[10px] font-extrabold text-slate-400">EOL</span>}
                          {promos[v.id]?.items.some((x) => x.state === "aktif") && <span className="ml-1.5 rounded bg-emerald-50 px-1 text-[10px] font-extrabold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">PROMO</span>}
                        </button>
                        <span className="shrink-0 text-right tabular-nums">
                          <b className="block text-sm text-slate-950">{rp(v.promo)}</b>
                          {v.promo < v.normal && <span className="block text-[11px] text-slate-400 line-through">{rp(v.normal)}</span>}
                        </span>
                      </li>
                    )),
                  )}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {qoala.length > 0 && (
        <section className="sd-panel p-4 sm:p-5">
          <h2 className="mb-3 text-base font-black text-slate-950">Qoala Protection</h2>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
            {qoala.map((t) => (
              <li key={t.tier} className={`px-3 py-2 ${tier?.tier === t.tier ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
                <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100">{t.tier} <span className="font-medium text-slate-500">· {t.range}</span></p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{Object.entries(t.fees).map(([m, fee]) => `${m} bln ${rp(fee)}`).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const KIND_LABEL: Record<string, string> = { PWP: "PWP", "TRADE IN": "Trade In", "TAMBAHAN TRADE IN": "Tambahan Trade In", EIP: "EIP (kartu kredit)", LAIN: "Promo" };
const short = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;

/** Samsung promos of the selected variant (from the imported promo workbook) and the best nett price. */
function PromoBox({ vp, price, today, model }: { vp: VariantPromo; price: number; today: string; model: string }) {
  const kinds = vp.cash.kinds.map((k) => KIND_LABEL[k].replace(" (kartu kredit)", "")).join(" + ");
  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-black tracking-[.12em] text-emerald-800 uppercase dark:text-emerald-300">Promo Samsung</p>
        <Link href={`/promo-samsung?f=all&s=${encodeURIComponent(model)}`} prefetch={false} className="text-xs font-semibold text-blue-600 hover:underline">Detail ›</Link>
      </div>
      <ul className="mt-1.5 space-y-1">
        {vp.items.map((it) => {
          const now = it.ranges.find((r) => r.from <= today && today <= r.to);
          const when = it.state === "aktif" ? (now ? `s/d ${short(now.to)}` : "") : `mulai ${short(it.ranges.filter((r) => r.from > today).map((r) => r.from).sort()[0] ?? "")}`;
          return (
            <li key={`${it.kind}-${it.code}-${it.value}`} className={`flex items-baseline justify-between gap-2 text-[13px] ${it.state === "aktif" ? "" : "opacity-60"}`}>
              <span className="min-w-0"><b>{KIND_LABEL[it.kind]}</b> <code className="text-[11px] text-slate-500">{it.code}</code> <span className="text-[11px] text-slate-500">{when}</span></span>
              <b className="shrink-0 tabular-nums text-emerald-700 dark:text-emerald-400">{rp(it.value)}</b>
            </li>
          );
        })}
        {vp.info.length > 0 && <li className="text-[12px] text-slate-500">Ada promo lain di {vp.info.join(", ")} — lihat ketentuan.</li>}
      </ul>
      {vp.cash.total > 0 && (
        <div className="mt-2 border-t border-dashed border-emerald-300 pt-2 dark:border-emerald-800">
          <p className="text-[11px] font-black tracking-[.12em] text-slate-500 uppercase">Nett s/d</p>
          <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">{rp(price - vp.cash.total)}</p>
          <p className="text-[11px] text-slate-500">Promo price − {kinds} (syarat berlaku: barang lama untuk trade in, kartu kredit untuk EIP).</p>
        </div>
      )}
      {vp.pwp > 0 && <p className="mt-1.5 text-[12px] text-slate-600 dark:text-slate-300">+ PWP: barang pasangan s/d <b>{rp(vp.pwp)}</b> (bukan potongan harga HP).</p>}
    </div>
  );
}
