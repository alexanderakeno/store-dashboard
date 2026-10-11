import { ChecklistPage } from "@/components/modules/ChecklistPage";
import { appConfig } from "@/config/app";
import { requireSession } from "@/lib/auth/session";
import type { SearchParams } from "@/lib/page";
import { todayIn } from "@/lib/domain/period";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const q = await searchParams;
  const today = todayIn(appConfig().timeZone);
  const date = typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : today;
  return (
    <ChecklistPage
      role="SPV"
      date={date}
      canEdit={session.role === "admin"}
      items={[
        { section: "Opening", tasks: ["Cek kehadiran & grooming team", "Briefing target harian", "Cek display & price tag", "Cek kas awal"] },
        { section: "Operasional", tasks: ["Monitoring pencapaian per jam", "Cek stok fast moving", "Follow up customer pending"] },
        { section: "Closing", tasks: ["Rekap sales & invoice", "Cek kas & setoran", "Laporan harian ke AM"] },
      ]}
    />
  );
}
