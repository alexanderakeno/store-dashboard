import { Suspense } from "react";
import { appConfig } from "@/config/app";
import { requireSession } from "@/lib/auth/session";
import { Shell } from "@/components/shell/Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const cfg = appConfig();
  return (
    <Suspense>
      <Shell
        storeCode={cfg.storeCode || "STORE"}
        storeName={cfg.storeName || cfg.appName}
        userName={session.name}
        isAdmin={session.role === "admin"}
        fixture={cfg.dataSource === "fixture"}
      >
        {children}
      </Shell>
    </Suspense>
  );
}
