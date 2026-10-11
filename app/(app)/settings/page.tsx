import { appConfig } from "@/config/app";
import { EmptyBlock, PageIntro, Panel } from "@/components/kit";
import { DisplayPrefs } from "@/components/modules/DisplayPrefs";
import { MonthForm, RulesForm, TrafficForm, UserForm } from "@/components/modules/settings/forms";
import { eachDay, monthEnd, monthStart, todayIn } from "@/lib/domain/period";
import { monthLabel } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { dataSource } from "@/lib/repositories";
import { getMonths, getRules } from "@/lib/services/dashboard";

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await loadPage(searchParams);
  const isAdmin = p.session.role === "admin";
  const cfg = appConfig();
  const ds = dataSource();
  const today = todayIn(cfg.timeZone);
  const [months, users, overrides, rules] = isAdmin
    ? await Promise.all([getMonths().catch(() => []), ds.listUsers().catch(() => []), ds.getRuleOverrides().catch(() => ({})), getRules().catch(() => null)])
    : [[], [], {}, null];
  const trafficMonth = p.state === "ok" ? p.month : null;
  const trafficDays = trafficMonth ? eachDay(monthStart(trafficMonth), trafficMonth === today.slice(0, 7) ? today : monthEnd(trafficMonth)) : [];
  const trafficInit = p.state === "ok" ? Object.fromEntries(p.snap.traffic.map((t) => [t.date, t.traffic])) : {};

  return (
    <div className="sd-content">
      <PageIntro title="Settings" desc="Atur refresh, font, tampilan, dan bantuan dashboard." />
      {p.state === "error" && <div className="alert error">{p.error}</div>}

      <Panel title="Tampilan" desc="Disimpan di browser ini.">
        <DisplayPrefs />
      </Panel>

      <Panel title="Refresh & Bantuan">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          <li>Data dibaca dari Google Sheet dan di-cache {Math.round(cfg.cacheTtlMs / 60000)} menit. Tombol <b>Perbarui</b> di kanan atas membaca ulang sekarang (admin).</li>
          <li>Tanggal &quot;data s/d&quot; = tanggal terakhir yang ada di tab Control MR &amp; SP. Time gone = tanggal itu ÷ jumlah hari bulan × 100.</li>
          <li>Kartu bertanda <span className="sd-need">Need Data</span> berarti sumber datanya belum dihubungkan — lihat menu <b>Data Upload</b>.</li>
        </ul>
      </Panel>

      {!isAdmin ? (
        <EmptyBlock title="Pengaturan data hanya untuk admin" need={false} />
      ) : (
        <>
          <Panel title="File bulanan" desc="Satu Google Sheet per bulan.">
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead><tr><th>Bulan</th><th>Label</th><th>Spreadsheet</th><th>Diubah</th></tr></thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td className="font-bold">{monthLabel(m.month)}{!m.active && <span className="sd-badge slate ml-2">nonaktif</span>}</td>
                      <td>{m.label}</td>
                      <td>{ds.kind === "sheets" ? <a href={`https://docs.google.com/spreadsheets/d/${m.spreadsheetId}`} target="_blank" rel="noreferrer" className="sd-badge blue">buka ↗</a> : m.spreadsheetId}</td>
                      <td className="text-xs text-slate-500">{m.updatedAt ? new Date(m.updatedAt).toLocaleDateString("id-ID", { timeZone: cfg.timeZone }) : ""} {m.updatedBy}</td>
                    </tr>
                  ))}
                  {months.length === 0 && <tr><td colSpan={4} className="text-slate-500">Belum ada.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-4"><MonthForm defaultMonth={today.slice(0, 7)} fixture={ds.kind === "fixture"} /></div>
            {ds.kind === "sheets" && <p className="mt-3 text-xs text-slate-500">Bagikan file bulanan (Viewer) ke <code>{cfg.serviceAccountEmail || "service account"}</code>. Aplikasi tidak pernah menulis ke file bulanan.</p>}
          </Panel>

          <Panel title={trafficMonth ? `Traffic · ${monthLabel(trafficMonth)}` : "Traffic"} desc="Pengunjung per hari, untuk CVR.">
            {trafficMonth ? <TrafficForm key={trafficMonth} month={trafficMonth} days={trafficDays} initial={trafficInit} /> : <EmptyBlock title="Daftarkan bulan dulu" need={false} />}
          </Panel>

          <Panel title="Akun viewer" desc="Read-only; admin diatur lewat env.">
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead><tr><th>NIK</th><th>Nama</th><th>Status</th></tr></thead>
                <tbody>
                  {users.map((u) => <tr key={u.nik}><td>{u.nik}</td><td>{u.name}</td><td>{u.active ? <span className="sd-badge green">aktif</span> : <span className="sd-badge slate">nonaktif</span>}</td></tr>)}
                  {users.length === 0 && <tr><td colSpan={3} className="text-slate-500">Belum ada akun viewer.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-4"><UserForm /></div>
          </Panel>

          <Panel title="Aturan bisnis" desc="VAS brand, override grup, supplier ACC, channel online, cap point.">
            <RulesForm overrides={JSON.stringify(overrides, null, 2)} effective={JSON.stringify(rules, null, 2)} />
          </Panel>
        </>
      )}
    </div>
  );
}
