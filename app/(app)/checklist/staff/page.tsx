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
      role="Staff"
      date={date}
      canEdit={session.role === "admin"}
      items={[
        { section: "Opening", tasks: ["Absen & grooming", "Bersihkan area display", "Cek demo unit menyala"] },
        { section: "Selama Shift", tasks: ["Input CX / New Member", "Tawarkan VAS (Qoala) di setiap device", "Rapikan display setelah transaksi"] },
        { section: "Closing", tasks: ["Cek demo unit & charger", "Rapikan gudang kecil", "Serah terima shift"] },
      ]}
    />
  );
}
