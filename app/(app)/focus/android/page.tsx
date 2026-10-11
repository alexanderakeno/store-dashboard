import { FocusPage } from "@/components/modules/FocusPage";
import type { SearchParams } from "@/lib/page";

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <FocusPage searchParams={searchParams} path="/focus/android" group="Android" title="Android Fokus" desc="Pencapaian Android per brand. Target utama menggunakan Value." itemLabel="Brand" />;
}
