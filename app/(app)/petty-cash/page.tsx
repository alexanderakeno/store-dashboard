import { PageIntro } from "@/components/kit";
import { PettyCashApp } from "@/components/modules/PettyCashApp";
import { appConfig } from "@/config/app";
import { requireAdminPage } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/period";
import { aiProvider } from "@/lib/pettyCash";

export default async function PettyCashPage() {
  await requireAdminPage();
  const c = appConfig();
  return (
    <div className="sd-content">
      <PageIntro eyebrow={`${c.storeCode || "STORE"} • Administrasi`} title="Petty Cash" desc="Upload struk / invoice → dibaca otomatis → PDF Petty Cash Replenishment Summary + lampiran invoice, ukuran di bawah 2 MB." />
      <PettyCashApp
        defaults={{ storeName: c.storeName, storeCode: c.storeCode, location: c.storeLocation }}
        today={todayIn(c.timeZone)}
        ai={aiProvider() !== null}
      />
    </div>
  );
}
