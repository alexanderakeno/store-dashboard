import { appConfig } from "@/config/app";
import { PageIntro } from "@/components/kit";
import { requireSession } from "@/lib/auth/session";
import { StokanApp } from "@/components/modules/StokanApp";
import { listSessions, staffCandidates } from "@/lib/stokan";
import { getSoh } from "@/lib/soh";
import { todayIn } from "@/lib/domain/period";

export default async function StokanPage() {
  const session = await requireSession();
  const isAdmin = session.role === "admin";
  const code = appConfig().storeCode || "STORE";
  let error: string | null = null;
  // the three reads at once (were one after another)
  const [sessions, candidates, soh] = await Promise.all([
    listSessions().catch((e: Error) => {
      error = e.message;
      return [];
    }),
    isAdmin ? staffCandidates() : [],
    isAdmin ? getSoh().catch(() => null) : null,
  ]);
  const active = sessions.find((s) => s.status === "count" || s.status === "recount") ?? null;
  const today = todayIn(appConfig().timeZone);
  return (
    <div className="sd-content">
      <PageIntro eyebrow={code} title="Stokan Aksesoris" desc={isAdmin ? "Hitung stok aksesoris dengan scan barcode · staff tidak melihat jumlah SOH · selisih dihitung ulang oleh staff lain." : "Hitung stok aksesoris bagian Anda dengan kamera HP."} />
      {error && <div className="alert error" role="alert">Data stokan tidak bisa dibaca: {error}</div>}
      <StokanApp isAdmin={isAdmin} candidates={candidates} active={active} history={sessions.filter((s) => s !== active).slice(0, 20)} sohDate={soh?.date ?? null} sohToday={!!soh && (soh.date === today || (soh.updatedAt ?? "").slice(0, 10) === today)} />
    </div>
  );
}
