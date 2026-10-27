import type { PriceItem } from "@/types/pricelist";
import type { SohItem } from "@/types/soh";

/** SOH category for Apple earphones (AirPods & EarPods). */
export const AIRPODS = "AirPods";

/** Apple's own AirPods / EarPods (not third-party cases "… AIRPODS PRO 2 CASE"). */
export const isAirPods = (brand: string, description: string) => /^APPLE$/i.test(brand.trim()) && /\b(AIR ?PODS|EAR ?PODS)\b/i.test(description);

/**
 * Model + variant of an AirPods / EarPods description:
 * "AIRPODS PRO 3" → AirPods Pro 3 · "AIRPODS 4 WITH ACTIVE NOISE CANCELLATION" → AirPods 4 ANC ·
 * "EARPODS WITH LIGHTNING CONNECTOR" → EarPods · Lightning · "AIRPODS MAX MIDNIGHT" → AirPods Max.
 */
export function airpodsModel(description: string): { series: string; variant: string } {
  const d = ` ${description.toUpperCase().replace(/[()]/g, " ").replace(/\s+/g, " ")} `;
  const port = /LIGHTNING/.test(d) ? "Lightning" : /USB[- ]?C|TYPE[- ]?C/.test(d) ? "USB-C" : /3[.,]5/.test(d) ? "3.5mm" : "";
  if (/EAR ?PODS/.test(d)) return { series: "EarPods", variant: port };
  if (/\bMAX\b/.test(d)) return { series: "AirPods Max", variant: port };
  const pro = /\bPRO\b/.test(d);
  const gen = /\bPRO (\d)\b/.exec(d)?.[1] ?? /AIR ?PODS (\d)\b/.exec(d)?.[1] ?? /\b(\d)(?:ST|ND|RD|TH) GEN/.exec(d)?.[1] ?? "";
  const anc = !pro && /\bANC\b|NOISE CANCELL?ATION/.test(d);
  return { series: ["AirPods", pro ? "Pro" : "", gen, anc ? "ANC" : ""].filter(Boolean).join(" "), variant: "" };
}

/**
 * The Apple price list has no AirPods: their price rows come from the SOH Excel (unit price column) — one row per
 * model / variant, carrying its SOH articles so stock and colours are matched like the other Apple rows.
 */
export function airpodsPriceItems(soh: SohItem[]): PriceItem[] {
  const map = new Map<string, PriceItem>();
  for (const s of soh) {
    if (s.category !== AIRPODS || !s.price) continue;
    const { series, variant } = airpodsModel(s.description);
    const name = variant ? `${series} ${variant}` : series;
    const it = map.get(name);
    if (it) {
      it.articles!.push(s.article);
      it.normal = it.promo = Math.max(it.normal, s.price);
    } else map.set(name, { kind: "apple", brand: AIRPODS, series, name, normal: s.price, promo: s.price, status: "ACTIVE", note: "Harga dari SOH", articles: [s.article] });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
