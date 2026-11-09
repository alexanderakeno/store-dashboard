/**
 * Accessories price list joined with the SOH: what each accessory in the store sells for.
 * Pure — the page passes the stored list and the latest SOH.
 */
import type { AccPriceItem } from "@/types/accPrice";
import type { SohItem } from "@/types/soh";
import { AIRPODS } from "./airpods";

/** SOH categories that are accessories (Apple earphones are sold as accessories too). */
export const ACC_SOH_CATEGORIES = ["Aksesoris", AIRPODS, "Elektronik"];

/** Where the price came from: the accessories price list, the unit price printed in the SOH, or nowhere. */
export type AccPriceSource = "list" | "soh" | "none";

export interface AccRow {
  article: string;
  description: string;
  brand: string;
  category: string;
  /** Units in the SOH (0 = not in stock; null = no SOH loaded). */
  qty: number | null;
  /** Selling price (null = unknown). */
  price: number | null;
  /** Reference SRP — shown struck through when the price is lower. */
  srp: number | null;
  /** Price before this update ("Current SRP Cash") — a difference means the shelf label must change. */
  current: number | null;
  remark: string;
  src: AccPriceSource;
}

export interface AccSummary {
  /** Accessory articles in stock / units. */
  articles: number;
  units: number;
  /** In-stock articles priced by the list, by the SOH price only, without any price. */
  fromList: number;
  fromSoh: number;
  noPrice: number;
  /** Rows (of the shown set) whose price changed in this update / sell below the SRP. */
  changed: number;
  promo: number;
}

const isAcc = (x: SohItem) => ACC_SOH_CATEGORIES.includes(x.category);

/** SAP article prefixes of brands that are not in the accessories list (Samsung / Xiaomi / … own accessories, VAS). */
const PREFIX_BRAND: Record<string, string> = { SSU: "Samsung", XMI: "Xiaomi", HWI: "Huawei", OPP: "Oppo", IFX: "Infinix", KLA: "Qoala", TSL: "Telkomsel", MOT: "Motorola", VIV: "Vivo", RLM: "Realme" };

/** Brand of any article: the list's brand, else the article prefix (SSU → Samsung, UNQ → UNIQ), else "Lainnya". */
export function brandResolver(list: AccPriceItem[]): (article: string) => string {
  const by = new Map(list.map((x) => [x.article, x.brand]));
  const pre = prefixBrands(list);
  return (a) => {
    const k = a.trim().toUpperCase();
    return by.get(k) ?? pre.get(k.slice(0, 3)) ?? "Lainnya";
  };
}

/** Brand per 3-letter article prefix, learnt from the list (a prefix used by one brand only, e.g. UNQ → UNIQ). */
function prefixBrands(list: AccPriceItem[]): Map<string, string> {
  const seen = new Map<string, Set<string>>();
  for (const x of list) {
    const p = x.article.slice(0, 3);
    (seen.get(p) ?? seen.set(p, new Set()).get(p)!).add(x.brand);
  }
  const out = new Map(Object.entries(PREFIX_BRAND));
  for (const [p, b] of seen) if (b.size === 1 && !out.has(p)) out.set(p, [...b][0]);
  return out;
}

/**
 * `all = false`: one row per accessory article in the SOH (in stock), priced from the list (else the SOH price).
 * `all = true`: every article of the price list (stock 0 when not in the SOH), plus SOH accessories missing from it.
 */
export function accRows(list: AccPriceItem[], soh: SohItem[] | null, all = false): AccRow[] {
  const byArticle = new Map(list.map((x) => [x.article, x]));
  const stock = new Map<string, SohItem>();
  for (const x of soh ?? []) if (isAcc(x)) stock.set(x.article.trim().toUpperCase(), x);
  const fromList = (x: AccPriceItem, qty: number | null): AccRow => ({ article: x.article, description: x.description, brand: x.brand, category: x.category, qty, price: x.price, srp: x.srp, current: x.current, remark: x.remark ?? "", src: "list" });
  const brands = prefixBrands(list);
  const fromSoh = (a: string, s: SohItem): AccRow => ({ article: a, description: s.description, brand: brands.get(a.slice(0, 3)) ?? "Lainnya", category: s.category, qty: s.qty, price: s.price ?? null, srp: null, current: null, remark: "", src: s.price ? "soh" : "none" });

  const rows: AccRow[] = [];
  if (all || !soh) {
    for (const x of list) rows.push(fromList(x, soh ? (stock.get(x.article)?.qty ?? 0) : null));
    for (const [a, s] of stock) if (!byArticle.has(a)) rows.push(fromSoh(a, s));
  } else {
    for (const [a, s] of stock) {
      if (s.qty <= 0) continue;
      const x = byArticle.get(a);
      rows.push(x ? fromList(x, s.qty) : fromSoh(a, s));
    }
  }
  // priced rows first, then by brand / category / description
  return rows.sort((p, q) => Number(p.src === "none") - Number(q.src === "none") || p.brand.localeCompare(q.brand) || p.category.localeCompare(q.category) || p.description.localeCompare(q.description));
}

export function accSummary(rows: AccRow[], soh: SohItem[] | null): AccSummary {
  const inStock = (soh ?? []).filter((x) => isAcc(x) && x.qty > 0);
  const listed = new Set(rows.filter((r) => r.src === "list" && (r.qty ?? 0) > 0).map((r) => r.article));
  const fromList = inStock.filter((x) => listed.has(x.article.trim().toUpperCase())).length;
  const fromSoh = inStock.filter((x) => !listed.has(x.article.trim().toUpperCase()) && x.price).length;
  return {
    articles: inStock.length,
    units: inStock.reduce((a, x) => a + x.qty, 0),
    fromList,
    fromSoh,
    noPrice: inStock.length - fromList - fromSoh,
    changed: rows.filter((r) => r.price != null && r.current != null && r.price !== r.current).length,
    promo: rows.filter((r) => r.price != null && r.srp != null && r.price < r.srp).length,
  };
}

/** Rows as tuples for the client (thousands of rows: keys would double the payload). */
export type AccTuple = [article: string, description: string, brand: string, category: string, qty: number | null, price: number | null, srp: number | null, current: number | null, remark: string, src: AccPriceSource];
export const packAcc = (r: AccRow): AccTuple => [r.article, r.description, r.brand, r.category, r.qty, r.price, r.srp, r.current, r.remark, r.src];
export const unpackAcc = (t: AccTuple): AccRow => ({ article: t[0], description: t[1], brand: t[2], category: t[3], qty: t[4], price: t[5], srp: t[6], current: t[7], remark: t[8], src: t[9] });

/** Price per SOH accessory for the SOH page: [price, SRP, from the SOH unit price (1) or the list (0)]. */
export type AccPriceCell = [price: number, srp: number, soh: 0 | 1];
export type AccPriceMap = Record<string, AccPriceCell>;

export function accPriceMap(list: AccPriceItem[], soh: SohItem[]): AccPriceMap {
  const byArticle = new Map(list.map((x) => [x.article, x]));
  const out: AccPriceMap = {};
  for (const s of soh) {
    if (!isAcc(s)) continue;
    const a = s.article.trim().toUpperCase();
    const x = byArticle.get(a);
    if (x) out[a] = [x.price, x.srp, 0];
    else if (s.price) out[a] = [s.price, s.price, 1];
  }
  return out;
}
