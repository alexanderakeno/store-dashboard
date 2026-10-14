import { notFound } from "next/navigation";
import { Empty } from "@/components/ui";
import { NAV } from "@/components/layout/nav";
import { Topbar } from "@/components/layout/Topbar";
import { loadPage, type SearchParams } from "@/lib/page";

/** Modules planned after phase 1 — shown as "coming soon" with the reason. */
export default async function ModulePlaceholder({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: SearchParams }) {
  const { module } = await params;
  const item = NAV.find((n) => n.href === `/${module}` && n.soon);
  if (!item) notFound();
  const p = await loadPage(searchParams);
  return (
    <>
      <Topbar title={item.label} p={p} />
      <Empty title={`${item.label} — segera`}>{item.soon}</Empty>
    </>
  );
}
