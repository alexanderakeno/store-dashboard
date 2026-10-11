import { appConfig } from "@/config/app";
import { NeedData, PageIntro, Panel } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { staffNames } from "@/components/modules/staffList";
import { loadPage, type SearchParams } from "@/lib/page";

export default async function StokanPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Stokan" p={p} />;
  const code = appConfig().storeCode || "STORE";
  const names = staffNames(p.snap);
  return (
    <div className="sd-content">
      <PageIntro eyebrow={code} title="Stokan" desc={`${code} • Inventory`} />
      <section className="sd-hero p-6">
        <p className="text-xs font-black tracking-[.12em] text-white/80 uppercase">Stokan Aksesoris</p>
        <p className="mt-1 text-2xl font-black">Stokan mingguan Accessories {code}</p>
        <div className="mt-5 grid max-w-2xl gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-[11px] font-black tracking-[.08em] text-white/80 uppercase">Periode Stokan</span><input className="sd-input mt-1" disabled placeholder="Week…" /></label>
          <label className="block"><span className="text-[11px] font-black tracking-[.08em] text-white/80 uppercase">Tanggal</span><input className="sd-input mt-1" type="date" disabled /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="sd-btn" disabled>Upload File Stokan</button>
          <button type="button" className="sd-btn" disabled>Clear Stokan</button>
        </div>
      </section>
      <Panel title="Stokan Siap Print" desc="PDF A4 Landscape • hemat kertas • 40 artikel/halaman" right={<div className="flex items-center gap-2"><NeedData /><button type="button" className="sd-btn" disabled>Print / PDF Semua</button></div>}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {names.map((n) => (
            <div key={n} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <p className="font-black text-slate-950">{n}</p>
              <p className="text-sm text-slate-500">— Artikel • estimasi — halaman</p>
              <div className="mt-3 flex gap-2"><button type="button" className="sd-btn !min-h-8 text-xs" disabled>Lihat Detail</button><button type="button" className="sd-btn !min-h-8 text-xs" disabled>PDF</button></div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Butuh file stokan (daftar artikel aksesoris per minggu) — dibagi otomatis ke staff setelah file diupload.</p>
      </Panel>
      <Panel title="Histori Stokan" right={<NeedData />}><p className="text-sm text-slate-500">Belum ada histori stokan.</p></Panel>
    </div>
  );
}
