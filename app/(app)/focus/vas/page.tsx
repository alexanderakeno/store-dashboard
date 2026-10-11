import { FocusPage } from "@/components/modules/FocusPage";
import type { SearchParams } from "@/lib/page";

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <FocusPage searchParams={searchParams} path="/focus/vas" group="VAS" title="VAS Fokus" desc="Pilih provider untuk melihat detail. Target utama menggunakan Value." itemLabel="Provider" />;
}
