import Link from "next/link";
import { appConfig } from "@/config/app";
import { PageIntro } from "@/components/kit";
import { requireSession } from "@/lib/auth/session";
import { getPriceList } from "@/lib/pricelist";
import { accTicketItems, resolveSlot } from "@/lib/domain/priceTicket";
import { getAccPriceList } from "@/lib/accPrice";
import { TICKET_TEMPLATES } from "@/lib/priceTicket/templates";
import { APPLE_TEMPLATES } from "@/lib/priceTicket/apple";
import { PriceTicketApp, type TicketData } from "@/components/modules/PriceTicketApp";
import { dmy } from "@/lib/format";

export default async function PriceTicketPage() {
  const session = await requireSession();
  const code = appConfig().storeCode || "STORE";
  let error: string | null = null;
  // both lists at once; accessories on the Apple tickets (Apple Pencil, Magic Keyboard, …) are priced from the accessories list
  const [list, acc] = await Promise.all([
    getPriceList().catch((e: Error) => {
      error = e.message;
      return null;
    }),
    getAccPriceList().catch(() => null),
  ]);
  // without a readable price list every slot keeps the design's price ("missing")
  const items = [...(list?.items ?? []), ...accTicketItems(acc?.items ?? [])];
  // Apple after Samsung; the rest as generated
  const all = [...TICKET_TEMPLATES.filter((t) => t.brand === "Xiaomi" || t.brand === "Samsung"), ...APPLE_TEMPLATES, ...TICKET_TEMPLATES.filter((t) => t.brand !== "Xiaomi" && t.brand !== "Samsung")];
  const tickets: TicketData[] = all.map((tpl) => ({ tpl, slots: tpl.slots.map((s) => resolveSlot(s, items, tpl.kind ?? "android")) }));
  const date = list?.dates?.android ?? list?.dates?.apple ?? null;
  return (
    <div className="sd-content">
      <PageIntro
        eyebrow={code}
        title="Price Ticket"
        desc="Price ticket sesuai desain Canva · harga otomatis dari Price List · download PDF per item atau sekaligus (ukuran asli / A4)."
        actions={session.role === "admin" ? <Link href="/upload#pricelist-android" prefetch={false} className="sd-btn">Update Price List</Link> : undefined}
      />
      {error && <div className="alert error" role="alert">Price list tidak bisa dibaca ({error}) — ticket memakai harga desain.</div>}
      <PriceTicketApp tickets={tickets} listDate={date ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? dmy(date) : date) : null} />
    </div>
  );
}
