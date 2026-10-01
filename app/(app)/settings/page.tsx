import { appConfig } from "@/config/app";
import { Card, Empty } from "@/components/ui";
import { Topbar } from "@/components/layout/Topbar";
import { MonthForm, RulesForm, TrafficForm, UserForm } from "@/components/modules/settings/forms";
import { requireAdminPage } from "@/lib/auth/session";
import { eachDay, monthEnd, monthStart, todayIn } from "@/lib/domain/period";
import { monthLabel } from "@/lib/format";
import { loadPage, type SearchParams } from "@/lib/page";
import { dataSource } from "@/lib/repositories";
import { getMonths, getRules } from "@/lib/services/dashboard";

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminPage();
  const p = await loadPage(searchParams);
  const cfg = appConfig();
  const ds = dataSource();
  const today = todayIn(cfg.timeZone);
  const [months, users, overrides, rules] = await Promise.all([
    getMonths().catch(() => []),
    ds.listUsers().catch(() => []),
    ds.getRuleOverrides().catch(() => ({})),
    getRules().catch(() => null),
  ]);
  const trafficMonth = p.state === "ok" ? p.month : null;
  const trafficDays = trafficMonth ? eachDay(monthStart(trafficMonth), trafficMonth === today.slice(0, 7) ? today : monthEnd(trafficMonth)) : [];
  const trafficInit = p.state === "ok" ? Object.fromEntries(p.snap.traffic.map((t) => [t.date, t.traffic])) : {};

  return (
    <>
      <Topbar title="Settings" p={p} />
      <div className="stack">
        {p.state === "error" && <div className="alert error small">{p.error}</div>}

        <Card title="File bulanan" aside="satu Google Sheet per bulan">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Bulan</th><th>Label</th><th>Spreadsheet</th><th>Diubah</th></tr></thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td><b>{monthLabel(m.month)}</b>{!m.active && <span className="badge"> nonaktif</span>}</td>
                    <td>{m.label}</td>
                    <td className="small">
                      {ds.kind === "sheets" ? <a href={`https://docs.google.com/spreadsheets/d/${m.spreadsheetId}`} target="_blank" rel="noreferrer" className="badge info">buka ↗</a> : m.spreadsheetId}
                    </td>
                    <td className="small muted">{m.updatedAt ? new Date(m.updatedAt).toLocaleDateString("id-ID", { timeZone: cfg.timeZone }) : ""} {m.updatedBy}</td>
                  </tr>
                ))}
                {months.length === 0 && <tr><td colSpan={4} className="muted">Belum ada.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12 }}>
            <MonthForm defaultMonth={today.slice(0, 7)} fixture={ds.kind === "fixture"} />
          </div>
          {ds.kind === "sheets" && (
            <div className="small muted" style={{ marginTop: 8 }}>
              Bagikan file bulanan (Viewer) ke <code>{cfg.serviceAccountEmail || "service account"}</code>. Aplikasi tidak pernah menulis ke file bulanan.
            </div>
          )}
        </Card>

        <Card title={trafficMonth ? `Traffic · ${monthLabel(trafficMonth)}` : "Traffic"} aside="pengunjung per hari, untuk CVR">
          {trafficMonth ? <TrafficForm key={trafficMonth} month={trafficMonth} days={trafficDays} initial={trafficInit} /> : <Empty title="Daftarkan bulan dulu" />}
        </Card>

        <Card title="Akun viewer" aside="read-only; admin diatur lewat env">
          <table>
            <thead><tr><th>NIK</th><th>Nama</th><th>Status</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.nik}><td>{u.nik}</td><td>{u.name}</td><td>{u.active ? <span className="badge good">aktif</span> : <span className="badge">nonaktif</span>}</td></tr>
              ))}
              {users.length === 0 && <tr><td colSpan={3} className="muted">Belum ada akun viewer.</td></tr>}
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}><UserForm /></div>
        </Card>

        <Card title="Aturan bisnis" aside="VAS brand, override grup, supplier ACC, channel online, cap point">
          <RulesForm overrides={JSON.stringify(overrides, null, 2)} effective={JSON.stringify(rules, null, 2)} />
        </Card>
      </div>
    </>
  );
}
