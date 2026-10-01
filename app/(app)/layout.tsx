import { Suspense } from "react";
import { appConfig } from "@/config/app";
import { requireSession } from "@/lib/auth/session";
import { BottomNav, Sidebar } from "@/components/layout/Nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const cfg = appConfig();
  const isAdmin = session.role === "admin";
  const brand = (
    <>
      {cfg.storeName || cfg.appName}
      <small>
        {[cfg.storeCode, cfg.storeLocation].filter(Boolean).join(" · ")}
        {[cfg.storeCode, cfg.storeLocation].some(Boolean) ? " · " : ""}
        {session.name} ({isAdmin ? "admin" : "viewer"})
      </small>
    </>
  );
  return (
    <div className="shell">
      <Suspense>
        <Sidebar isAdmin={isAdmin} brand={brand} />
      </Suspense>
      <main className="main">{children}</main>
      <Suspense>
        <BottomNav isAdmin={isAdmin} />
      </Suspense>
    </div>
  );
}
