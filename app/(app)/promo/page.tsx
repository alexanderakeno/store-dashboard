import { EmptyBlock, NeedData, PageIntro, Panel } from "@/components/kit";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PromoPage() {
  await requireSession();
  return (
    <div className="sd-content">
      <PageIntro title="Promo Board" desc="Promo aktif, periode, dan mekanisme untuk referensi team." actions={<NeedData />} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {["Promo Device", "Promo Accessories", "Promo Bank / BNPL"].map((t) => (
          <Panel key={t} title={t}>
            <EmptyBlock title="Need Data">Sumber: tab &quot;Rekap Promo&quot; di sheet bulanan — perlu dihubungkan (kolom: nama promo, periode, mekanisme, artikel).</EmptyBlock>
          </Panel>
        ))}
      </div>
    </div>
  );
}
