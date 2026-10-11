import { ChecklistPage } from "@/components/modules/ChecklistPage";
import { appConfig } from "@/config/app";
import { requireSession } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/period";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireSession();
  return (
    <ChecklistPage
      role="SPV"
      date={todayIn(appConfig().timeZone)}
      items={[
        { section: "Opening", tasks: ["Cek kehadiran & grooming team", "Briefing target harian", "Cek display & price tag", "Cek kas awal"] },
        { section: "Operasional", tasks: ["Monitoring pencapaian per jam", "Cek stok fast moving", "Follow up customer pending"] },
        { section: "Closing", tasks: ["Rekap sales & invoice", "Cek kas & setoran", "Laporan harian ke AM"] },
      ]}
    />
  );
}
