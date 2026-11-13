import type { ISODate } from "@/types/domain";
import type { AccPriceItem } from "@/types/accPrice";
import type { PriceItem } from "@/types/pricelist";
import type { PwpProgram, PwpPromo } from "@/types/pwpPromo";
import { promoState, type PromoState } from "./samsungPromo";

/** End date used for "Further Notice" promos (see parsers/pwpPromo). */
const FURTHER = "2099-12-31";

/** Selling price per article: price-list promo price (devices) and accessories price list. */
export interface PwpPrices {
  device: Map<string, number>;
  acc: Map<string, number>;
}

export function pwpPrices(items: PriceItem[], acc: AccPriceItem[]): PwpPrices {
  const device = new Map<string, number>();
  for (const it of items) for (const a of it.articles ?? []) if (it.promo > 0 && !device.has(a.toUpperCase())) device.set(a.toUpperCase(), it.promo);
  const accMap = new Map<string, number>();
  for (const x of acc) if (x.price > 0) accMap.set(x.article.toUpperCase(), x.price);
  return { device, acc: accMap };
}

/** "GALAXY S26 12/256GB SKY BLUE" → "GALAXY S26 12/256GB"; editions are kept ("… PUBG EDITION"). */
export function pwpModel(description: string): string {
  const d = description.toUpperCase().replace(/\s+/g, " ").trim();
  const m = d.match(/^(.*?\d+(?:\+\d+)?\s*\/\s*\d+\s*(?:GB|TB)?)\b/);
  if (!m) return d;
  const edition = d.slice(m[1].length).match(/\b([A-Z0-9]+ EDITION)\b/)?.[1];
  return edition ? `${m[1]} ${edition}` : m[1];
}

const dayNo = (d: ISODate) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 864e5;

/** End of the range running today (or the next one), null when open-ended. */
export function pwpEnd(p: Pick<PwpProgram, "ranges">, today: ISODate): ISODate | null {
  const r = p.ranges.find((x) => x.from <= today && today <= x.to) ?? p.ranges.filter((x) => x.from > today).sort((a, b) => a.from.localeCompare(b.from))[0] ?? p.ranges[p.ranges.length - 1];
  return !r || r.to >= FURTHER ? null : r.to;
}

/** Days left including today (30 Nov seen on 30 Nov = 1), null when open-ended. */
export function daysLeft(end: ISODate | null, today: ISODate): number | null {
  return end ? dayNo(end) - dayNo(today) + 1 : null;
}

export interface PwpItemView {
  description: string;
  articles: string[];
  price: number;
  filePrice: number;
  /** Price taken from the accessories price list (else the file). */
  listed: boolean;
}

export interface PwpOfferView {
  items: PwpItemView[];
  cashback: number;
  br: string;
  codes: string[];
}

export interface PwpModelView {
  name: string;
  articles: string[];
  colors: string[];
  price: number;
  filePrice: number;
  /** Price taken from the price list (else the file). */
  listed: boolean;
  offers: number[];
}

export interface PwpView {
  id: string;
  title: string;
  brand: string;
  br: string;
  period: string;
  state: PromoState;
  start: ISODate | null;
  end: ISODate | null;
  daysLeft: number | null;
  models: PwpModelView[];
  offers: PwpOfferView[];
  /** Models whose price in the file differs from the price list. */
  mismatches: Array<{ name: string; file: number; list: number }>;
}

/** A program with today's prices: devices grouped per model (colours folded), accessories priced. */
export function pwpView(p: PwpProgram, prices: PwpPrices, today: ISODate): PwpView {
  const offers: PwpOfferView[] = p.offers.map((o) => ({
    items: o.items.map((it) => {
      const listed = it.articles.map((a) => prices.acc.get(a)).find((x) => x != null);
      return { description: it.description, articles: it.articles, price: listed ?? it.price, filePrice: it.price, listed: listed != null };
    }),
    cashback: o.cashback,
    br: o.br,
    codes: o.codes,
  }));
  const offersOf = new Map<number, number[]>();
  p.offers.forEach((o, oi) => o.devices.forEach((d) => offersOf.set(d, [...(offersOf.get(d) ?? []), oi])));
  const models = new Map<string, PwpModelView>();
  p.devices.forEach((d, di) => {
    const listed = prices.device.get(d.article);
    const price = listed ?? d.price;
    const name = pwpModel(d.description);
    const key = `${name}|${price}`;
    let m = models.get(key);
    if (!m) models.set(key, (m = { name, articles: [], colors: [], price, filePrice: d.price, listed: listed != null, offers: [] }));
    m.articles.push(d.article);
    const color = d.description.toUpperCase().slice(name.length).replace(/\s+/g, " ").trim();
    if (color && !m.colors.includes(color)) m.colors.push(color);
    for (const oi of offersOf.get(di) ?? []) if (!m.offers.includes(oi)) m.offers.push(oi);
  });
  const list = [...models.values()];
  const mismatches = list.filter((m) => m.listed && m.filePrice !== m.price).map((m) => ({ name: m.name, file: m.filePrice, list: m.price }));
  const end = pwpEnd(p, today);
  const start = p.ranges.map((r) => r.from).sort()[0] ?? null;
  return { id: p.id, title: p.title, brand: p.brand, br: p.br, period: p.period, state: promoState(p.ranges, today), start, end, daysLeft: daysLeft(end, today), models: list, offers, mismatches };
}

/** Short PWP info for one price-list variant (its SAP articles). */
export interface PwpBrief {
  id: string;
  title: string;
  state: PromoState;
  end: ISODate | null;
  daysLeft: number | null;
  /** Number of accessories / bundles to choose from. */
  count: number;
  maxCashback: number;
  /** Cheapest pair: its name and price after cashback. */
  best: { description: string; nett: number } | null;
}

export function variantPwp(articles: string[], promo: PwpPromo | null, today: ISODate, prices?: PwpPrices): PwpBrief[] {
  if (!promo || !articles.length) return [];
  const set = new Set(articles.map((a) => a.toUpperCase()));
  const out: PwpBrief[] = [];
  for (const p of promo.programs) {
    const state = promoState(p.ranges, today);
    if (state === "selesai") continue;
    const devs = new Set(p.devices.flatMap((d, i) => (set.has(d.article) ? [i] : [])));
    if (!devs.size) continue;
    const offers = p.offers.filter((o) => o.devices.some((d) => devs.has(d)));
    if (!offers.length) continue;
    const accPrice = (it: PwpProgram["offers"][number]["items"][number]) => it.articles.map((a) => prices?.acc.get(a)).find((x) => x != null) ?? it.price;
    const nett = offers.map((o) => ({ description: o.items.map((it) => it.description).join(" + "), nett: o.items.reduce((a, it) => a + accPrice(it), 0) - o.cashback }));
    const end = pwpEnd(p, today);
    out.push({
      id: p.id,
      title: p.title,
      state,
      end,
      daysLeft: daysLeft(end, today),
      count: offers.length,
      maxCashback: Math.max(...offers.map((o) => o.cashback)),
      best: nett.sort((a, b) => a.nett - b.nett)[0] ?? null,
    });
  }
  return out;
}

/**
 * "Promo PWP Huawei Pura 90s series dengan Huawei Free Clip 2 series" → "Huawei Pura 90s series + Free Clip 2 series"
 * (the brand once); with `dropBrand` also without the leading brand (shown next to a brand label).
 */
export function pwpShortTitle(title: string, brand = "", dropBrand = false): string {
  let t = title.replace(/^\s*promo\s+pwp\s*/i, "").replace(/\s+dengan\s+/i, " + ").replace(/\bMotorla\b/i, "Motorola");
  if (brand) {
    let seen = false;
    t = t.replace(new RegExp(`\\b${brand}\\s+`, "gi"), (m) => (seen ? "" : ((seen = true), m)));
    if (dropBrand) t = t.replace(new RegExp(`^${brand}\\s+`, "i"), "");
  }
  return t.replace(/\s+/g, " ").trim() || title;
}

/** Running programs that end within `days` days (open-ended ones never do), soonest first. */
export function endingSoon(promo: PwpPromo | null, today: ISODate, days = 21): Array<{ id: string; title: string; brand: string; end: ISODate; daysLeft: number }> {
  if (!promo) return [];
  return promo.programs
    .filter((p) => promoState(p.ranges, today) === "aktif")
    .map((p) => {
      const end = pwpEnd(p, today);
      return { id: p.id, title: p.title, brand: p.brand, end: end ?? "", daysLeft: daysLeft(end, today) ?? Infinity };
    })
    .filter((p) => p.end && p.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
