import Link from "next/link";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { NeedData, PageIntro, Panel } from "@/components/kit";
import { PageStatus } from "@/components/layout/PageStatus";
import { monthLabel, timeAgo } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";

export default async function UploadPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  if (p.state !== "ok") return <PageStatus title="Data Upload" p={p} />;
  const s = p.snap;
  const isAdmin = p.session.role === "admin";
  const sources = [
    { name: "Control MR & SP (sales)", ok: true, detail: `${s.lines.length} baris SP · ${s.merch.length} baris MR · data s/d ${s.lastDataDate ?? "–"}` },
    { name: "Target Store", ok: !!s.target, detail: s.target ? `${s.target.staff.length} staff · ${Object.keys(s.target.sections).length} section` : "Tab Target Store belum terbaca" },
    { name: "Traffic (CVR)", ok: s.traffic.length > 0, detail: s.traffic.length ? `${s.traffic.length} hari diinput` : "Input di Settings → Traffic" },
    { name: "SOH / Stock On Hand", ok: false, detail: "Format file SOH belum ada" },
    { name: "Stokan Aksesoris", ok: false, detail: "Format file stokan belum ada" },
    { name: "Jadwal / Shift Staff", ok: false, detail: "Untuk status Masuk Shift di Daily Sales" },
    { name: "Master Staff (jabatan)", ok: false, detail: "Cashier / Sales Assistant / Store Trainer" },
    { name: "Promo", ok: false, detail: "Tab 'Rekap Promo' ada di sheet bulanan — belum dihubungkan" },
    { name: "CX & New Member", ok: false, detail: "Tab 'CX&GR Tracker' ada di sheet bulanan — belum dihubungkan" },
    { name: "BNPL & Trade-In", ok: false, detail: "Belum ada sumber" },
    { name: "Skema Incentive", ok: false, detail: "Untuk Est. Incentive" },
    { name: `Data ${Number(p.month.slice(0, 4)) - 1} (LFL / YTD / Compare)`, ok: p.months.some((m) => m.month.startsWith(String(Number(p.month.slice(0, 4)) - 1))), detail: "Daftarkan file bulanan tahun lalu di Settings" },
  ];
  return (
    <div className="sd-content">
      <PageIntro title="Data Upload" desc={`Status sumber data ${monthLabel(p.month)} · file: ${s.sourceTitle} · dibaca ${timeAgo(s.loadedAt)}.`} actions={isAdmin ? <Link href="/settings" className="sd-btn primary">Kelola di Settings</Link> : undefined} />
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
      <Panel title="Upload File" desc="Upload langsung dari aplikasi (xls/xlsx) akan aktif setelah format tiap file disepakati." right={<NeedData />}>
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">Drag & drop file di sini — belum aktif</div>
      </Panel>
    </div>
  );
}
