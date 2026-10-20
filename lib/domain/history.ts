import type { BusinessRules } from "@/config/business";
import type { MerchLine, SalesLine } from "@/types/domain";
import { classify } from "./classify";

/**
 * Last-year months imported from a Merchandise Report (no Sales Person file): every MR line becomes
 * a sales line with the MR qty and net, classified with the same rules as the current year, so
 * LFL / YTD / Compare can use them. There is no staff, invoice or channel information.
 */
export function historyLines(merch: MerchLine[], rules: BusinessRules): SalesLine[] {
  return merch.map((m) => {
    const raw = { date: m.date, nik: null, staffName: "", article: m.article, description: m.description, invoice: "", amount: m.net, type: m.productGroup, brand: m.brand, category: m.category };
    const c = classify(raw, rules);
    return { ...raw, ...c, isChannel: false, qty: m.qty, qtySource: "exact" as const };
  });
}
