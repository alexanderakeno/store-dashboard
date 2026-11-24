import { PageIntro } from "@/components/kit";
import { PettyCashApp } from "@/components/modules/PettyCashApp";
import { appConfig } from "@/config/app";
import { requireAdminPage } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/period";
import { aiProvider } from "@/lib/pettyCash";

export default async function PettyCashPage() {
  const session = await requireAdminPage();
  const c = appConfig();
  // the form writes the brand only ("Digiplus"); the location has its own line
  const loc = c.storeLocation.trim();
  const brand = loc && c.storeName.toLowerCase().endsWith(loc.toLowerCase()) ? c.storeName.slice(0, -loc.length).trim() : c.storeName;
  return (
    <div className="sd-content">
      <PageIntro eyebrow={`${c.storeCode || "STORE"} • Administrasi`} title="Petty Cash" desc="Upload struk / invoice → dibaca otomatis → PDF Petty Cash Replenishment Summary + lampiran invoice, ukuran di bawah 2 MB." />
      <PettyCashApp
        defaults={{ storeName: brand || c.storeName, storeCode: c.storeCode, location: c.storeLocation, preparedBy: session.name }}
        today={todayIn(c.timeZone)}
        ai={aiProvider() !== null}
      />
    </div>
  );
}
