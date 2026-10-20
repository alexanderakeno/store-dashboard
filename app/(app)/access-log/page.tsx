import { appConfig } from "@/config/app";
import { PageIntro, Panel, Stat } from "@/components/kit";
import { ParamDate, ParamSelect } from "@/components/kit/controls";
import { titleFor } from "@/components/shell/nav";
import { requireAdminPage } from "@/lib/auth/session";
import { EVENT_LABEL, filterAccess, summarizeAccess } from "@/lib/domain/access";
import { normalizeNik } from "@/lib/domain/normalize";
import { addDays, todayIn } from "@/lib/domain/period";
import { timeAgo } from "@/lib/format";
import type { SearchParams } from "@/lib/page";
import { dataSource } from "@/lib/repositories";
import type { AccessEntry, AccessEvent } from "@/types/access";

export const dynamic = "force-dynamic";

/** Rows read from the log per page load (newest first). */
const READ_LIMIT = 5000;
/** Rows shown in the detail table. */
const SHOW_LIMIT = 500;

const EVENT_TONE: Record<AccessEvent, string> = { login: "green", login_failed: "red", logout: "slate", view: "blue" };
const isDate = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function AccessLogPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminPage();
  const raw = await searchParams;
  const q = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  const cfg = appConfig();
  const tz = cfg.timeZone;
  const today = todayIn(tz);
  const from = isDate(q("from")) ? q("from")! : addDays(today, -6);
  const to = isDate(q("to")) ? q("to")! : today;
  const nik = q("nik") ?? "";
  const kind = q("kind") === "login" || q("kind") === "view" ? (q("kind") as "login" | "view") : "";

  const ds = dataSource();
  let entries: AccessEntry[] = [];
  let error: string | null = null;
  const [users] = await Promise.all([
    ds.listUsers().catch(() => []),
    ds
      .listAccess(READ_LIMIT)
      .then((e) => (entries = e))
      .catch((e: Error) => (error = e.message)),
  ]);
  const adminNik = normalizeNik(cfg.adminNik) ?? cfg.adminNik;
  const accounts = [
    ...(adminNik ? [{ nik: adminNik, name: cfg.adminName || session.name, role: "admin" }] : []),
    ...users.map((u) => ({ nik: u.nik, name: u.name, role: u.active ? "viewer" : "viewer (nonaktif)" })),
  ];
  const nameOf = new Map(accounts.map((a) => [a.nik, a.name]));

  const period = filterAccess(entries, { from, to, timeZone: tz });
  const summary = summarizeAccess(nik ? period.filter((e) => e.nik === nik) : period, nik ? accounts.filter((a) => a.nik === nik) : accounts, tz);
  const detail = filterAccess(period, { nik, kind, timeZone: tz });
  const shown = detail.slice(0, SHOW_LIMIT);
  const oldest = entries.length ? entries[entries.length - 1].ts : null;

  const fmt = (ts: string) =>
    new Date(ts).toLocaleString("id-ID", { timeZone: tz, weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtShort = (ts: string | null) => (ts ? new Date(ts).toLocaleString("id-ID", { timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");

  const logins = period.filter((e) => e.event === "login" && (!nik || e.nik === nik));
  const failed = period.filter((e) => e.event === "login_failed" && (!nik || e.nik === nik));
  const activeAccounts = summary.filter((r) => r.lastSeen).length;

  const accountOptions = [
    { value: "", label: "Semua akun" },
    ...accounts.map((a) => ({ value: a.nik, label: `${a.name} (${a.nik})` })),
    ...[...new Set(entries.map((e) => e.nik))].filter((n) => n && !nameOf.has(n)).map((n) => ({ value: n, label: `${n} (tidak dikenal)` })),
  ];

  return (
    <div className="sd-content">
      <PageIntro
        title="Log Akses"
        desc={`Siapa yang login dan halaman apa yang dibuka, dari akun mana, dengan jam ${tz === "Asia/Jakarta" ? "WIB" : tz}. Hanya admin yang bisa melihat halaman ini.`}
      />
      {error && <div className="alert error">Log akses tidak bisa dibaca: {error}</div>}

      <Panel>
        <div className="grid gap-3 sm:grid-cols-4">
          <ParamSelect param="nik" value={nik} label="Akun" options={accountOptions} />
          <ParamDate param="from" value={from} max={to} label="Dari tanggal" />
          <ParamDate param="to" value={to} min={from} max={today} label="Sampai tanggal" />
          <ParamSelect
            param="kind"
            value={kind}
            label="Aktivitas"
            options={[
              { value: "", label: "Semua aktivitas" },
              { value: "login", label: "Login / logout saja" },
              { value: "view", label: "Buka halaman saja" },
            ]}
          />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Login berhasil" value={logins.length} sub="dalam periode" tone="green" />
        <Stat label="Login gagal" value={failed.length} sub="password / NIK salah" tone={failed.length ? "rose" : "blue"} />
        <Stat label="Akun aktif" value={`${activeAccounts} / ${summary.length}`} sub="pernah membuka dashboard" tone="violet" />
        <Stat label="Halaman dibuka" value={period.filter((e) => e.event === "view" && (!nik || e.nik === nik)).length} sub="tercatat" tone="amber" />
      </div>

      <Panel title="Ringkasan per akun" desc="Periode yang dipilih. Akun yang masih login (sesi 12 jam) tetap tercatat lewat halaman yang dibuka, walau tidak login ulang.">
        <ul className="space-y-2 sm:hidden">
          {summary.map((r) => (
            <li key={r.nik} className="rounded-xl border border-slate-200 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{r.name || nameOf.get(r.nik) || "(tidak dikenal)"}</p>
                  <p className="text-xs text-slate-500">{r.nik}{r.role ? ` · ${r.role}` : ""}</p>
                </div>
                {r.lastSeen ? <span className="sd-badge blue">{timeAgo(new Date(r.lastSeen).getTime())}</span> : <span className="sd-badge slate">belum ada</span>}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                Login {r.logins} · {r.failed ? <b className="text-rose-600">gagal {r.failed}</b> : "gagal 0"} · halaman {r.views} · {r.days} hari aktif
              </p>
              <p className="mt-1 text-xs text-slate-500">Login terakhir {fmtShort(r.lastLogin)} · aktif terakhir {fmtShort(r.lastSeen)}{r.lastDevice ? ` · ${r.lastDevice}` : ""}</p>
            </li>
          ))}
        </ul>
        <div className="sd-table-wrap max-sm:hidden">
          <table className="sd-table">
            <thead>
              <tr><th>Akun</th><th>Login</th><th>Gagal</th><th>Halaman</th><th>Hari aktif</th><th>Login terakhir</th><th>Aktivitas terakhir</th><th>Perangkat terakhir</th></tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.nik}>
                  <td>
                    <span className="font-bold">{r.name || nameOf.get(r.nik) || "(tidak dikenal)"}</span>
                    <span className="block text-xs text-slate-500">{r.nik}{r.role ? ` · ${r.role}` : ""}</span>
                  </td>
                  <td>{r.logins}</td>
                  <td>{r.failed ? <span className="sd-badge red">{r.failed}</span> : 0}</td>
                  <td>{r.views}</td>
                  <td>{r.days}</td>
                  <td className="whitespace-nowrap">{fmtShort(r.lastLogin)}</td>
                  <td className="whitespace-nowrap">
                    {r.lastSeen ? (
                      <>
                        {fmtShort(r.lastSeen)}
                        <span className="block text-xs text-slate-500">{timeAgo(new Date(r.lastSeen).getTime())}</span>
                      </>
                    ) : (
                      <span className="sd-badge slate">belum ada</span>
                    )}
                  </td>
                  <td className="text-xs text-slate-600">{r.lastDevice || "–"}</td>
                </tr>
              ))}
              {summary.length === 0 && <tr><td colSpan={8} className="text-slate-500">Belum ada akun.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Detail aktivitas"
        desc={detail.length > SHOW_LIMIT ? `${detail.length} aktivitas — ditampilkan ${SHOW_LIMIT} terbaru. Persempit tanggal atau pilih akun untuk melihat sisanya.` : `${detail.length} aktivitas, terbaru di atas.`}
      >
        <ul className="divide-y divide-slate-200 sm:hidden">
          {shown.map((e, i) => (
            <li key={`${e.ts}-${i}`} className="py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-bold">{e.name || nameOf.get(e.nik) || "(tidak dikenal)"} <span className="font-normal text-slate-500">{e.nik}</span></span>
                <span className={`sd-badge ${EVENT_TONE[e.event]}`}>{EVENT_LABEL[e.event]}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">{fmt(e.ts)}{e.path ? ` · ${titleFor(e.path)}` : ""}</p>
              <p className="text-xs text-slate-500">{[e.ip, e.location, e.device].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
          {shown.length === 0 && <li className="py-2 text-sm text-slate-500">Belum ada aktivitas pada filter ini.</li>}
        </ul>
        <div className="sd-table-wrap max-sm:hidden">
          <table className="sd-table">
            <thead>
              <tr><th>Waktu</th><th>Akun</th><th>Aktivitas</th><th>Halaman</th><th>IP / lokasi</th><th>Perangkat</th></tr>
            </thead>
            <tbody>
              {shown.map((e, i) => (
                <tr key={`${e.ts}-${i}`}>
                  <td className="whitespace-nowrap">{fmt(e.ts)}</td>
                  <td>
                    <span className="font-bold">{e.name || nameOf.get(e.nik) || "(tidak dikenal)"}</span>
                    <span className="block text-xs text-slate-500">{e.nik}</span>
                  </td>
                  <td><span className={`sd-badge ${EVENT_TONE[e.event]}`}>{EVENT_LABEL[e.event]}</span></td>
                  <td>{e.path ? <><span>{titleFor(e.path)}</span><span className="block text-xs text-slate-500">{e.path}</span></> : "–"}</td>
                  <td className="text-xs">
                    {e.ip || "–"}
                    {e.location && <span className="block text-slate-500">{e.location}</span>}
                  </td>
                  <td className="text-xs text-slate-600">{e.device || "–"}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={6} className="text-slate-500">Belum ada aktivitas pada filter ini. Log mulai tercatat sejak fitur ini dipasang.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Disimpan di tab <code>APP_Access</code> pada master sheet. Halaman yang sama dari akun yang sama dicatat sekali per 2 menit.
          {entries.length >= READ_LIMIT && oldest ? ` Yang dibaca hanya ${READ_LIMIT} baris terbaru (sejak ${fmtShort(oldest)}).` : ""}
        </p>
      </Panel>
    </div>
  );
}
