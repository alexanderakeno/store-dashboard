import Link from "next/link";
import { appConfig } from "@/config/app";
import { PageIntro, Panel } from "@/components/kit";
import { ParamDate, ParamSelect } from "@/components/kit/controls";
import { titleFor } from "@/components/shell/nav";
import { requireAdminPage } from "@/lib/auth/session";
import { filterAccess, groupByDay, summarizeAccess } from "@/lib/domain/access";
import { normalizeNik } from "@/lib/domain/normalize";
import { addDays, todayIn } from "@/lib/domain/period";
import { timeAgo } from "@/lib/format";
import type { SearchParams } from "@/lib/page";
import { withQuery } from "@/lib/qs";
import { dataSource } from "@/lib/repositories";
import type { AccessEntry } from "@/types/access";

export const dynamic = "force-dynamic";

/** Newest rows read from the log per page load. */
const READ_LIMIT = 5000;
/** Rows shown in the activity list. */
const SHOW_LIMIT = 300;

const isDate = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Short sentence for one activity: "buka Staff Performance", "login", … */
function what(e: AccessEntry): { text: string; dot: string } {
  if (e.event === "view") return { text: `buka ${titleFor(e.path)}`, dot: "blue" };
  if (e.event === "login") return { text: "login", dot: "green" };
  if (e.event === "login_failed") return { text: "gagal login", dot: "red" };
  return { text: "logout", dot: "slate" };
}

export default async function AccessLogPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminPage();
  const raw = await searchParams;
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") q[k] = v;
  const cfg = appConfig();
  const tz = cfg.timeZone;
  const today = todayIn(tz);
  const from = isDate(q.from) ? q.from : addDays(today, -6);
  const to = isDate(q.to) ? q.to : today;
  const nik = q.nik ?? "";
  const kind = q.kind === "login" || q.kind === "view" ? q.kind : "";

  const ds = dataSource();
  let error: string | null = null;
  const [users, entries] = await Promise.all([
    ds.listUsers().catch(() => []),
    ds.listAccess(READ_LIMIT).catch((e: Error) => {
      error = e.message;
      return [] as AccessEntry[];
    }),
  ]);
  const adminNik = normalizeNik(cfg.adminNik) ?? cfg.adminNik;
  const accounts = [
    ...(adminNik ? [{ nik: adminNik, name: cfg.adminName || session.name, role: "admin" }] : []),
    ...users.map((u) => ({ nik: u.nik, name: u.name, role: u.active ? "viewer" : "nonaktif" })),
  ];
  const nameOf = new Map(accounts.map((a) => [a.nik, a.name]));
  const who = (n: string, fallback = "") => fallback || nameOf.get(n) || `NIK ${n}`;

  const period = filterAccess(entries, { from, to, timeZone: tz });
  const mine = nik ? period.filter((e) => e.nik === nik) : period;
  const summary = summarizeAccess(mine, nik ? accounts.filter((a) => a.nik === nik) : accounts, tz);
  const detail = filterAccess(mine, { kind, timeZone: tz });
  const days = groupByDay(detail.slice(0, SHOW_LIMIT), tz);
  const oldest = entries.length ? entries[entries.length - 1].ts : null;

  const count = (ev: AccessEntry["event"]) => mine.filter((e) => e.event === ev).length;
  const stats = [
    { label: "Login", value: count("login") },
    { label: "Gagal", value: count("login_failed"), bad: count("login_failed") > 0 },
    { label: "Akun aktif", value: `${summary.filter((r) => r.lastSeen).length}/${summary.length}` },
    { label: "Halaman", value: count("view") },
  ];

  const presets = [
    { label: "Hari ini", from: today },
    { label: "7 hari", from: addDays(today, -6) },
    { label: "30 hari", from: addDays(today, -29) },
  ];
  const presetActive = to === today ? presets.find((p) => p.from === from) : undefined;
  const kinds = [
    { key: "", label: "Semua" },
    { key: "login", label: "Login" },
    { key: "view", label: "Halaman" },
  ];

  const hm = (ts: string) => new Date(ts).toLocaleTimeString("id-ID", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const dayLabel = (d: string) =>
    d === today ? "Hari ini" : d === addDays(today, -1) ? "Kemarin" : new Date(`${d}T12:00:00Z`).toLocaleDateString("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="sd-content">
      <PageIntro title="Log Akses" desc="Siapa yang login dan halaman apa yang dibuka. Jam dalam WIB." />
      {error && <div className="alert error">Log akses tidak bisa dibaca: {error}</div>}

      <Panel className="!p-3 sm:!p-4">
        <div className="space-y-3">
          <nav className="sd-tabs sm grid-cols-3" aria-label="Periode">
            {presets.map((p) => (
              <Link key={p.label} href={withQuery("/access-log", q, { from: p.from, to: today })} prefetch={false} className="sd-tab" aria-current={presetActive === p ? "page" : undefined}>
                {p.label}
              </Link>
            ))}
          </nav>
          <div className="grid gap-3 sm:grid-cols-2">
            <ParamSelect param="nik" value={nik} options={[{ value: "", label: "Semua akun" }, ...accounts.map((a) => ({ value: a.nik, label: a.name }))]} />
            <nav className="sd-tabs sm grid-cols-3" aria-label="Jenis aktivitas">
              {kinds.map((k) => (
                <Link key={k.key} href={withQuery("/access-log", q, { kind: k.key || null })} prefetch={false} className="sd-tab" aria-current={kind === k.key ? "page" : undefined}>
                  {k.label}
                </Link>
              ))}
            </nav>
          </div>
          <details open={!presetActive} className="text-sm">
            <summary className="cursor-pointer text-slate-500 select-none">
              {presetActive ? "Pilih tanggal lain" : `Tanggal: ${from} s/d ${to}`}
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <ParamDate param="from" value={from} max={to} label="Dari" />
              <ParamDate param="to" value={to} min={from} max={today} label="Sampai" />
            </div>
          </details>
        </div>
      </Panel>

      <section className="sd-panel sd-log-stats" aria-label="Ringkasan">
        {stats.map((s) => (
          <div key={s.label} className="px-2 py-3 text-center">
            <p className={`text-lg font-black sm:text-2xl ${s.bad ? "text-rose-600" : "text-slate-950"}`}>{s.value}</p>
            <p className="text-[11px] font-semibold text-slate-500 sm:text-xs">{s.label}</p>
          </div>
        ))}
      </section>

      <Panel title="Per akun" desc="Klik akun untuk melihat aktivitasnya saja." className="!p-4 sm:!p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {summary.map((r) => {
            const active = nik === r.nik;
            return (
              <Link key={r.nik} href={withQuery("/access-log", q, { nik: active ? null : r.nik })} prefetch={false} className="sd-log-acct" aria-current={active ? "true" : undefined}>
                <span className={`sd-dot ${r.lastSeen ? "green" : ""}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {who(r.nik, r.name)}
                    {r.role !== "viewer" && <span className="ml-1.5 text-xs font-semibold text-slate-500">{r.role}</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {r.lastSeen ? `${timeAgo(new Date(r.lastSeen).getTime())}${r.lastDevice ? ` · ${r.lastDevice}` : ""}` : "Belum membuka dashboard"}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs leading-tight text-slate-500">
                  <b className="text-slate-900">{r.logins}</b> login
                  <br />
                  <b className="text-slate-900">{r.views}</b> hlm
                  {r.failed > 0 && <span className="mt-0.5 block font-bold text-rose-600">{r.failed} gagal</span>}
                </span>
              </Link>
            );
          })}
          {summary.length === 0 && <p className="text-sm text-slate-500">Belum ada akun.</p>}
        </div>
      </Panel>

      <Panel
        title="Aktivitas"
        desc={detail.length > SHOW_LIMIT ? `${SHOW_LIMIT} terbaru dari ${detail.length}. Pilih akun atau persempit tanggal untuk melihat sisanya.` : `${detail.length} aktivitas`}
        className="!p-4 sm:!p-5"
      >
        {days.map((d) => (
          <div key={d.date}>
            <p className="sd-log-day">{dayLabel(d.date)}</p>
            <ul className="sd-log-list">
              {d.items.map((e, i) => {
                const w = what(e);
                return (
                  <li key={`${e.ts}-${i}`} className="flex items-start gap-3 py-2.5">
                    <time dateTime={e.ts} className="w-11 shrink-0 pt-px text-sm font-bold tabular-nums text-slate-900">{hm(e.ts)}</time>
                    <span className={`sd-dot ${w.dot} mt-1.5`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">
                        <b>{who(e.nik, e.name)}</b> <span className={e.event === "login_failed" ? "font-semibold text-rose-600" : "text-slate-600"}>{w.text}</span>
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {[e.location.split(",")[0], e.device].filter(Boolean).join(" · ") || e.ip}
                        {e.ip && (e.location || e.device) && <span className="max-sm:hidden"> · {e.ip}</span>}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {days.length === 0 && <p className="text-sm text-slate-500">Belum ada aktivitas pada filter ini.</p>}
        <p className="mt-4 text-xs text-slate-500">
          Tersimpan di tab <code>APP_Access</code> (master sheet). Halaman yang sama dicatat sekali per 2 menit per akun.
          {entries.length >= READ_LIMIT && oldest ? ` Yang terbaca ${READ_LIMIT} baris terbaru, sejak ${new Date(oldest).toLocaleDateString("id-ID", { timeZone: tz })}.` : ""}
        </p>
      </Panel>
    </div>
  );
}
