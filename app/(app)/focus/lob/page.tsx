import { FocusPage } from "@/components/modules/FocusPage";
import type { SearchParams } from "@/lib/page";

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <FocusPage searchParams={searchParams} path="/focus/lob" group="Apple" title="LOB Target Fokus" desc="Monitoring LOB Apple (iPhone, iPad, Mac, Apple Watch, AirPods) — target value dari Target Store." itemLabel="Product" />;
}
