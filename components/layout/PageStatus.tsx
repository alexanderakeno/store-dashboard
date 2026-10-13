import Link from "next/link";
import type { PageData } from "@/lib/page";
import { EmptyBlock, PageIntro } from "@/components/kit";
import { RetryButton } from "@/components/kit/RetryButton";

/** Rendered when a page has no usable month (nothing registered / load error). */
export function PageStatus({ title, p }: { title: string; p: Exclude<PageData, { state: "ok" }> }) {
  const admin = p.session.role === "admin";
  return (
    <div className="sd-content">
      <PageIntro title={title} />
      {p.state === "no-month" ? (
        <EmptyBlock title="Belum ada bulan terdaftar" need={false}>
          {admin ? (
            <>Daftarkan link Google Sheet bulan ini di <Link prefetch={false} className="font-bold text-blue-600 underline" href="/settings">Settings</Link>.</>
          ) : (
            "Admin belum mendaftarkan file bulan ini."
          )}
        </EmptyBlock>
      ) : (
        <div className="space-y-3">
          <EmptyBlock title="Data tidak bisa dimuat" need={false}>
            {p.error} {admin && <Link prefetch={false} className="font-bold text-blue-600 underline" href="/settings">Buka Settings</Link>}
          </EmptyBlock>
          <div className="flex justify-center"><RetryButton /></div>
        </div>
      )}
    </div>
  );
}
