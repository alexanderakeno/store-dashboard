import { FocusPage } from "@/components/modules/FocusPage";
import type { SearchParams } from "@/lib/page";

/** LOB Target Fokus: Apple per LOB and Android per brand — targets from the Apple / Android sections of Target Store. */
export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <FocusPage
      searchParams={searchParams}
      path="/focus/lob"
      group="Apple"
      title="LOB Target Fokus"
      desc=""
      itemLabel="Product"
      tabs={[
        { key: "apple", label: "Apple", group: "Apple", itemLabel: "Product", desc: "Monitoring LOB Apple (iPhone, iPad, Mac, Apple Watch, AirPods) — target value dari Target Store." },
        { key: "android", label: "Android", group: "Android", itemLabel: "Brand", desc: "Monitoring Android per brand (Samsung, Xiaomi, Huawei, Motorola, Oppo, Infinix, …) — target value per brand dari blok Total Target di Target Store (otomatis ikut bila diubah)." },
      ]}
    />
  );
}
