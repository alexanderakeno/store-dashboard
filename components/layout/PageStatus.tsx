import Link from "next/link";
import type { PageData } from "@/lib/page";
import { Empty } from "@/components/ui";
import { Topbar } from "./Topbar";

/** Rendered when a page has no usable month (nothing registered / load error). */
export function PageStatus({ title, p }: { title: string; p: Exclude<PageData, { state: "ok" }> }) {
  const admin = p.session.role === "admin";
  return (
    <>
      <Topbar title={title} p={p} />
      {p.state === "no-month" ? (
        <Empty title="Belum ada bulan terdaftar">
          {admin ? (
            <>Daftarkan link Google Sheet bulan ini di <Link className="badge info" href="/settings">Settings</Link>.</>
          ) : (
            "Admin belum mendaftarkan file bulan ini."
          )}
        </Empty>
      ) : (
        <Empty title="Data tidak bisa dimuat">
          <p>{p.error}</p>
          {admin && <p><Link className="badge info" href="/settings">Buka Settings</Link></p>}
        </Empty>
      )}
    </>
  );
}
