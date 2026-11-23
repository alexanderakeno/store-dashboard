import { EmptyBlock, PageIntro, Panel } from "@/components/kit";
import { RetryButton } from "@/components/kit/RetryButton";
import { DraApp } from "@/components/modules/DraApp";
import { appConfig } from "@/config/app";
import { requireSession } from "@/lib/auth/session";
import { getDra } from "@/lib/dra";
import type { DraSnapshot } from "@/types/dra";

/** DRA: weekly network stock & sales per store per article (Excel upload), searchable and filterable. */
export default async function DraPage() {
  const session = await requireSession();
  let dra: DraSnapshot | null;
  try {
    dra = await getDra();
  } catch (e) {
    return (
      <div className="sd-content">
        <PageIntro title="DRA Stok & Sales" />
        <Panel>
          <div className="space-y-3" role="alert">
            <EmptyBlock title="DRA gagal dimuat" need={false}>Google Sheet (tab APP_DRA) tidak bisa dibaca saat ini: {(e as Error).message}</EmptyBlock>
            <div className="flex justify-center"><RetryButton /></div>
          </div>
        </Panel>
      </div>
    );
  }
  return (
    <div className="sd-content">
      <PageIntro
        title="DRA Stok & Sales"
        desc={dra ? `${dra.week || "DRA"} · stok & penjualan semua toko per artikel · cari artikel, pilih toko, saring brand / sub-LOB.` : "Stok & penjualan semua toko per artikel dari file DRA mingguan."}
      />
      <DraApp dra={dra} isAdmin={session.role === "admin"} storeCode={appConfig().storeCode} />
    </div>
  );
}
