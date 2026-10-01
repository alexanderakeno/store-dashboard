import { Suspense } from "react";
import { appConfig } from "@/config/app";
import { monthLabel, timeAgo } from "@/lib/format";
import { monthEnd, monthStart } from "@/lib/domain/period";
import type { PageData } from "@/lib/page";
import { LogoutButton, PeriodPicker, RefreshButton } from "./Controls";

export function Topbar({ title, p }: { title: string; p: PageData }) {
  const cfg = appConfig();
  const ok = p.state === "ok" ? p : null;
  const isAdmin = p.session.role === "admin";
  return (
    <div className="topbar">
      <div className="spread">
        <div>
          <div className="brand-mobile small muted">{cfg.storeName || cfg.appName}</div>
          <h1>{title}</h1>
        </div>
        <div className="row">
          {ok && (
            <Suspense>
              <PeriodPicker
                months={p.months.map((m) => ({ month: m.month, label: monthLabel(m.month) }))}
                month={ok.month}
                asOf={ok.asOf}
                min={monthStart(ok.month)}
                max={monthEnd(ok.month)}
              />
            </Suspense>
          )}
          {ok && isAdmin && <RefreshButton month={ok.month} />}
          <LogoutButton />
        </div>
      </div>
      {ok && (
        <div className="small muted" style={{ marginTop: 4 }}>
          Data s/d {ok.snap.lastDataDate ?? "–"} · diperbarui {timeAgo(ok.snap.loadedAt)}
          {cfg.dataSource === "fixture" && <span className="badge warn" style={{ marginLeft: 8 }}>DATA SINTETIS</span>}
          {ok.snap.issues.some((i) => i.severity === "error") && <a href={`/cutoff?m=${ok.month}`} className="badge bad" style={{ marginLeft: 8 }}>▼ Cek rekonsiliasi</a>}
        </div>
      )}
    </div>
  );
}
