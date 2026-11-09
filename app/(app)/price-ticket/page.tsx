import Link from "next/link";
import { appConfig } from "@/config/app";
import { PageIntro } from "@/components/kit";
import { requireSession } from "@/lib/auth/session";
import { getPriceList } from "@/lib/pricelist";
import { resolveSlot } from "@/lib/domain/priceTicket";
import { TICKET_TEMPLATES } from "@/lib/priceTicket/templates";
import { PriceTicketApp, type TicketData } from "@/components/modules/PriceTicketApp";
import { dmy } from "@/lib/format";

export default async function PriceTicketPage() {
  const session = await requireSession();
  const code = appConfig().storeCode || "STORE";
  let error: string | null = null;
  const list = await getPriceList().catch((e: Error) => {
    error = e.message;
    return null;
  });
  // without a readable price list every slot keeps the design's price ("missing")
  const items = list?.items ?? [];
  const tickets: TicketData[] = TICKET_TEMPLATES.map((tpl) => ({ tpl, slots: tpl.slots.map((s) => resolveSlot(s, items)) }));
  const date = list?.dates?.android ?? null;
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
