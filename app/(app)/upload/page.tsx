import Link from "next/link";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { NeedData, PageIntro, Panel } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { SohImportForm } from "@/components/modules/SohImportForm";
import { dmy, monthLabel, num, timeAgo } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { getSoh } from "@/lib/soh";
import { getPriceList } from "@/lib/pricelist";
import { getSamsungPromo } from "@/lib/samsungPromo";
import { SamsungPromoForm } from "@/components/modules/SamsungPromoForm";
import { PriceListImportForm } from "@/components/modules/PriceListImportForm";
import { appConfig } from "@/config/app";
import { ApplePriceListImportForm } from "@/components/modules/ApplePriceListImportForm";
import { SalesImportForm } from "@/components/modules/SalesImportForm";
import { getHistoryList } from "@/lib/services/dashboard";
import { rpf } from "@/lib/format";

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
  const promo = await getSamsungPromo().catch(() => null);
  let price: Awaited<ReturnType<typeof getPriceList>> = null;
  let priceError: string | null = null;
  try {
    price = await getPriceList();
  } catch (e) {
    priceError = (e as Error).message;
  }
  let history: Awaited<ReturnType<typeof getHistoryList>> = [];
  let historyError: string | null = null;
  try {
    history = await getHistoryList();
  } catch (e) {
    historyError = (e as Error).message;
  }
  const lastYear = String(Number(p.month.slice(0, 4)) - 1);
  const lyHistory = history.filter((h) => h.month.startsWith(lastYear));
  const priceCount = (k: "apple" | "android") => price?.items.filter((i) => i.kind === k).length ?? 0;
  const sources = [
    { name: "Control MR & SP (sales)", ok: true, detail: `${s.lines.length} baris SP · ${s.merch.length} baris MR · data s/d ${s.lastDataDate ? dmy(s.lastDataDate) : "–"}` },
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
          : "Belum ada — import PDF / Excel SOH di atas",
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
    {
      name: `Data ${lastYear} (LFL / YTD / Compare)`,
      ok: lyHistory.length > 0 || p.months.some((m) => m.month.startsWith(lastYear)),
      detail: lyHistory.length ? `Merchandise Report ${lyHistory.length} bulan (${lyHistory.map((h) => monthLabel(h.month).split(" ")[0]).reverse().join(", ")})` : `Upload Merchandise Report ${lastYear} di Import Data Penjualan di atas`,
    },
  ];
  return (
    <div className="sd-content">
      <PageIntro title="Data Upload" desc={`Status sumber data ${monthLabel(p.month)} · file: ${s.sourceTitle} · dibaca ${timeAgo(s.loadedAt)}.`} actions={isAdmin ? <Link href="/settings" prefetch={false} className="sd-btn primary">Kelola di Settings</Link> : undefined} />
      <div id="import" className="scroll-mt-20">
        <Panel title="Import Data Penjualan" desc="Satu tempat untuk semua file Merchandise Report & Sales Person, bulan apa saja. Bulan & tanggal dibaca otomatis dari isi file.">
          {isAdmin ? (
            <SalesImportForm sheetMonths={p.months.map((m) => m.month)} historyMonths={history.map((h) => h.month)} />
          ) : (
            <p className="text-sm text-slate-500">Hanya admin yang bisa import data.</p>
          )}
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>Bulan yang punya Google Sheet bulanan ({p.months.map((m) => monthLabel(m.month)).join(", ") || "belum ada"}) → masuk ke tab Control MR &amp; SP sheet itu, seperti Import Raw.</li>
            <li>Bulan lain → Merchandise Report disimpan sebagai riwayat penjualan untuk LFL, YTD, dan Compare.</li>
          </ul>
          {historyError && <div className="alert error mt-3">Gagal membaca riwayat (APP_History): {historyError}</div>}
          {history.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-700 select-none">Riwayat penjualan tersimpan · {history.length} bulan</summary>
              <div className="sd-table-wrap mt-2">
                <table className="sd-table sd-table-compact">
                  <thead><tr><th>Bulan</th><th>Tanggal</th><th className="n">Qty</th><th className="n">Net Sales</th><th className="max-sm:hidden">File</th></tr></thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.month}>
                        <td className="font-bold">{monthLabel(h.month)}</td>
                        <td>
                          {h.firstDate ? `${Number(h.firstDate.slice(8))}–${Number(h.lastDate.slice(8))}` : "–"}
                          {h.lastDate && Number(h.lastDate.slice(8)) < new Date(Date.UTC(Number(h.month.slice(0, 4)), Number(h.month.slice(5)), 0)).getUTCDate() && (
                            <span className="ml-1.5 sd-badge amber">belum full</span>
                          )}
                        </td>
                        <td className="n">{num(h.qty)}</td>
                        <td className="n">{rpf(h.net)}</td>
                        <td className="text-xs text-slate-500 max-sm:hidden">{h.source} · {timeAgo(new Date(h.updatedAt).getTime())}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </Panel>
      </div>
      <div id="soh" className="scroll-mt-20">
        <Panel title="Import SOH (Stock On Hand)" desc="Upload PDF Sales Dashboard V6 (halaman Stock On Hand) atau Excel Stock Position Report. Hasilnya tampil di tab SOH." right={soh ? <Link href="/soh" prefetch={false} className="sd-btn">Lihat SOH</Link> : undefined}>
          {isAdmin ? <SohImportForm current={soh?.date ?? null} /> : <p className="text-sm text-slate-500">Hanya admin yang bisa import data.</p>}
        </Panel>
      </div>
      <div id="pricelist" className="scroll-mt-20">
        <div id="pricelist-android" className="scroll-mt-20">
          <Panel title="Import Price List Android" desc="Upload PDF atau Excel price list Android (Samsung, Oppo, Xiaomi, …) → Dashboard › Price List › Android." right={priceCount("android") ? <Link href="/pricelist" prefetch={false} className="sd-btn">Lihat Android</Link> : undefined}>
            {isAdmin ? <PriceListImportForm current={price?.dates.android ?? null} storeCode={appConfig().storeCode} /> : <p className="text-sm text-slate-500">Hanya admin yang bisa import data.</p>}
          </Panel>
        </div>
      </div>
      <div id="promo-samsung" className="scroll-mt-20">
        <Panel title="Import Promo Samsung" desc="Upload file Excel List Promo Aktif Samsung → menu Promo Samsung & kartu Price List Samsung." right={promo ? <Link href="/promo-samsung" prefetch={false} className="sd-btn">Lihat Promo</Link> : undefined}>
          {isAdmin ? <SamsungPromoForm current={promo ? promo.source || promo.title : null} /> : <p className="text-sm text-slate-500">Hanya admin yang bisa import data.</p>}
        </Panel>
      </div>
      <div id="pricelist-apple" className="scroll-mt-20">
        <Panel title="Import Price List Apple" desc="Upload 2 PDF price list Apple sekaligus, atau 1 file Excel price list DIGIMAP → Dashboard › Price List › Apple." right={priceCount("apple") ? <Link href="/pricelist?k=apple" prefetch={false} className="sd-btn">Lihat Apple</Link> : undefined}>
          {isAdmin ? <ApplePriceListImportForm current={price?.dates.apple ?? null} /> : <p className="text-sm text-slate-500">Hanya admin yang bisa import data.</p>}
        </Panel>
      </div>
      <Panel title="Sumber Data">
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {sources.map((x) => (
            <li key={x.name} className="flex items-start justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {x.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" /> : <CircleDashed className="mt-0.5 size-5 shrink-0 text-amber-500" />}
                <div className="min-w-0"><p className="font-bold text-slate-950">{x.name}</p><p className="text-sm text-slate-500">{x.detail}</p></div>
              </div>
              <span className="shrink-0">{x.ok ? <span className="sd-badge green">OK</span> : <NeedData />}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
