import { FocusPage } from "@/components/modules/FocusPage";
import type { SearchParams } from "@/lib/page";

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <FocusPage searchParams={searchParams} path="/focus/3pp" group="ACC" title="Product Fokus 3PP" desc="Pilih supplier untuk melihat detail. Target utama menggunakan Value." itemLabel="Supplier" />;
}
