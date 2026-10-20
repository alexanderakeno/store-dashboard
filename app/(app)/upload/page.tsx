import Link from "next/link";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { NeedData, PageIntro, Panel } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { ImportRawForm } from "@/components/modules/ImportRawForm";
import { SohImportForm } from "@/components/modules/SohImportForm";
import { dmy, monthLabel, num, timeAgo } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { getSoh } from "@/lib/soh";
import { getPriceList } from "@/lib/pricelist";
import { PriceListImportForm } from "@/components/modules/PriceListImportForm";
import { ApplePriceListImportForm } from "@/components/modules/ApplePriceListImportForm";

export default async function UploadPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Data Upload" p={p} />;
  const s = p.snap;
  const isAdmin = p.session.role === "admin";
  const x = s.extras;
  let soh: Awaited<ReturnType<typeof getSoh>> = null;
  let sohError: string | null = null;
  try {
    soh = await getSoh();
  } catch (e) {
    sohError = (e as Error).message;
  }
  let price: Awaited<ReturnType<typeof getPriceList>> = null;
  let priceError: string | null = null;
  try {
    price = await getPriceList();
  } catch (e) {
    priceError = (e as Error).message;
  }
  const priceCount = (k: "apple" | "android") => price?.items.filter((i) => i.kind === k).length ?? 0;
  const sources = [
    { name: "Control MR & SP (sales)", ok: true, detail: `${s.lines.length} baris SP · ${s.merch.length} baris MR · data s/d ${s.lastDataDate ?? "–"}` },
    { name: "Target Store", ok: !!s.target, detail: s.target ? `${s.target.staff.length} staff · ${Object.keys(s.target.sections).length} section` : "Tab Target Store belum terbaca" },
    { name: "Traffic (CVR)", ok: s.traffic.length > 0, detail: s.traffic.length ? `${s.traffic.length} hari (${s.trafficFromApp} input aplikasi, sisanya tab Traffic)` : "Tab Traffic belum berisi bulan ini — input di Settings → Traffic" },
    { name: "CX & Google Review", ok: !!(x.cx || x.gr), detail: x.cx || x.gr ? `Tab CX&GR Tracker · ${x.cx?.days.length ?? 0} hari · ${(x.cx?.staff ?? []).length} staff` : "Tab CX&GR Tracker tidak ditemukan" },
    { name: "Promo", ok: !!x.promo?.length, detail: x.promo?.length ? `Tab Rekap Promo · ${x.promo.length} brand · ${x.promo.reduce((a, b) => a + b.items.length, 0)} promo` : "Tab Rekap Promo tidak ditemukan / kosong" },
    { name: "BNPL & Trade-In · Feedback · Weekly Reason · Checklist", ok: true, detail: "Input di aplikasi (admin) → tersimpan di master sheet tab APP_Records" },
    {
      name: "SOH / Stock On Hand",
      ok: !!soh,
      detail: soh
        ? `Import PDF · update ${soh.date ? dmy(soh.date) : "–"} · ${soh.items.length} artikel · qty ${num(soh.items.reduce((a, i) => a + i.qty, 0))} · ${soh.categories.length} kategori`
        : sohError
          ? `Gagal membaca APP_SOH: ${sohError}`
          : "Belum ada — import PDF Stock On Hand di atas",
    },
    {
      name: "Price List",
      ok: !!price,
      detail: price
        ? `Android ${priceCount("android")} tipe${price.dates.android ? ` (${dmy(price.dates.android)})` : ""} · Apple ${priceCount("apple") ? `${priceCount("apple")} tipe${price.dates.apple ? ` (${dmy(price.dates.apple)})` : ""}` : "belum ada"} · Qoala ${price.qoala.length} tier`
        : priceError
          ? `Gagal membaca APP_PriceList: ${priceError}`
          : "Belum ada — import PDF price list Android / Apple di atas",
    },
    { name: "Stokan Aksesoris", ok: false, detail: "Format file stokan belum ada" },
    { name: "Jadwal / Shift Staff", ok: false, detail: "Untuk status Masuk Shift di Daily Sales" },
    { name: "Master Staff (jabatan)", ok: false, detail: "Cashier / Sales Assistant / Store Trainer" },
    { name: "Skema Incentive", ok: false, detail: "Untuk Est. Incentive" },
    { name: `Data ${Number(p.month.slice(0, 4)) - 1} (LFL / YTD / Compare)`, ok: p.months.some((m) => m.month.startsWith(String(Number(p.month.slice(0, 4)) - 1))), detail: "Daftarkan file bulanan tahun lalu di Settings" },
  ];
  return (
    <div className="sd-content">
      <PageIntro title="Data Upload" desc={`Status sumber data ${monthLabel(p.month)} · file: ${s.sourceTitle} · dibaca ${timeAgo(s.loadedAt)}.`} actions={isAdmin ? <Link href="/settings" prefetch={false} className="sd-btn primary">Kelola di Settings</Link> : undefined} />
      <div id="import" className="scroll-mt-20">
        <Panel title="Import Raw MR & Sales Person" desc="Sama seperti menu Import Raw → Upload MR & Sales Person di Google Sheet. Bisa dari HP.">
          {isAdmin ? (
            <ImportRawForm month={p.month} monthLabel={monthLabel(p.month)} sourceTitle={s.sourceTitle} />
          ) : (
            <p className="text-sm text-slate-500">Hanya admin yang bisa import data.</p>
          )}
        </Panel>
      </div>
      <div id="soh" className="scroll-mt-20">
        <Panel title="Import SOH (Stock On Hand)" desc="Upload PDF Sales Dashboard V6 → halaman Stock On Hand. Hasilnya tampil di tab SOH." right={soh ? <Link href="/soh" prefetch={false} className="sd-btn">Lihat SOH</Link> : undefined}>
          {isAdmin ? <SohImportForm current={soh?.date ?? null} /> : <p className="text-sm text-slate-500">Hanya admin yang bisa import data.</p>}
        </Panel>
      </div>
      <div id="pricelist" className="scroll-mt-20">
        <div id="pricelist-android" className="scroll-mt-20">
          <Panel title="Import Price List Android" desc="Upload PDF price list Android (Samsung, Oppo, Xiaomi, …) → Dashboard › Price List › Android." right={priceCount("android") ? <Link href="/pricelist" prefetch={false} className="sd-btn">Lihat Android</Link> : undefined}>
            {isAdmin ? <PriceListImportForm current={price?.dates.android ?? null} /> : <p className="text-sm text-slate-500">Hanya admin yang bisa import data.</p>}
          </Panel>
        </div>
      </div>
      <div id="pricelist-apple" className="scroll-mt-20">
        <Panel title="Import Price List Apple" desc="Upload 2 PDF price list Apple sekaligus → Dashboard › Price List › Apple." right={priceCount("apple") ? <Link href="/pricelist?k=apple" prefetch={false} className="sd-btn">Lihat Apple</Link> : undefined}>
          {isAdmin ? <ApplePriceListImportForm current={price?.dates.apple ?? null} /> : <p className="text-sm text-slate-500">Hanya admin yang bisa import data.</p>}
        </Panel>
      </div>
      <Panel title="Sumber Data">
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {sources.map((x) => (
            <li key={x.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3">
                {x.ok ? <CheckCircle2 className="size-5 text-emerald-500" /> : <CircleDashed className="size-5 text-amber-500" />}
                <div><p className="font-bold text-slate-950">{x.name}</p><p className="text-sm text-slate-500">{x.detail}</p></div>
              </div>
              {x.ok ? <span className="sd-badge green">Terhubung</span> : <NeedData />}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
