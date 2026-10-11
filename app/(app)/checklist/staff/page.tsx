import { ChecklistPage } from "@/components/modules/ChecklistPage";
import { appConfig } from "@/config/app";
import { requireSession } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/period";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireSession();
  return (
    <ChecklistPage
      role="Staff"
      date={todayIn(appConfig().timeZone)}
      items={[
        { section: "Opening", tasks: ["Absen & grooming", "Bersihkan area display", "Cek demo unit menyala"] },
        { section: "Selama Shift", tasks: ["Input CX / New Member", "Tawarkan VAS (Qoala) di setiap device", "Rapikan display setelah transaksi"] },
        { section: "Closing", tasks: ["Cek demo unit & charger", "Rapikan gudang kecil", "Serah terima shift"] },
      ]}
    />
  );
}
