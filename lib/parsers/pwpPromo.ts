import type { PromoRange } from "@/types/samsungPromo";
import type { PwpDevice, PwpItem, PwpOffer, PwpProgram } from "@/types/pwpPromo";
import { parseRanges, type Cell, type SheetGrid } from "./samsungPromo";

const text = (c: Cell) => (c == null ? "" : String(c)).replace(/\s+/g, " ").trim();
const up = (c: Cell) => text(c).toUpperCase();
const money = (c: Cell): number | null => {
  if (typeof c === "number" && Number.isFinite(c)) return Math.round(c);
  const s = text(c).replace(/[^\d]/g, "");
  return s ? Number(s) : null;
};

const MONTHS: Record<string, number> = { JANUARI: 1, FEBRUARI: 2, MARET: 3, APRIL: 4, MEI: 5, JUNI: 6, JULI: 7, AGUSTUS: 8, SEPTEMBER: 9, OKTOBER: 10, NOVEMBER: 11, DESEMBER: 12, JANUARY: 1, FEBRUARY: 2, MARCH: 3, MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8, OCTOBER: 10, DECEMBER: 12 };

/** Promo end used for "… - Further Notice" periods. */
export const FURTHER = "2099-12-31";

/** "1 Oktober - 31 Desember 2026", "17 Juli 2026 - Further" → date ranges. */
export function pwpRanges(period: string, year: number): PromoRange[] {
  const s = period.toUpperCase();
  if (/FURTHER|SELANJUTNYA|SELAMANYA/.test(s)) {
    const m = s.match(new RegExp(`(\\d{1,2})\\s*(${Object.keys(MONTHS).join("|")})\\s*(\\d{4})?`));
    if (m) return [{ from: `${m[3] ?? year}-${String(MONTHS[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`, to: FURTHER }];
  }
  return parseRanges(period, year);
}

/** Brand of a program from its title / device names. */
export function brandOf(texts: string[]): string {
  const s = texts.join(" ").toUpperCase();
  const brands: Array<[RegExp, string]> = [
    [/SAMSUNG|GALAXY/, "Samsung"],
    [/XIAOMI|REDMI|POCO/, "Xiaomi"],
    [/HUAWEI/, "Huawei"],
    [/INFINIX/, "Infinix"],
    [/MOTOROLA|MOTO\b/, "Motorola"],
    [/OPPO/, "Oppo"],
    [/VIVO/, "Vivo"],
    [/REALME/, "Realme"],
    [/HONOR/, "Honor"],
    [/TECNO/, "Tecno"],
  ];
  return brands.find(([re]) => re.test(s))?.[1] ?? "Lainnya";
}

/** MOP codes written in a BR cell: "BR 88020 V11 MOP BTS: XIAOMI100" → ["XIAOMI100"]. */
export const mopCodes = (br: string) => [...br.toUpperCase().matchAll(/MOP[^:]*:\s*([A-Z0-9]+)/g)].map((m) => m[1]);

interface Cols {
  devArt: number;
  devDesc: number;
  devPrice: number;
  accArt: number;
  accDesc: number;
  accPrice: number;
  total: number;
  cashback: number;
  after: number;
  br: number;
}

/** Column roles of the "Digiplus Article | Description | Current Price …" header (Batam columns ignored). */
function colsOf(row: Cell[]): Cols | null {
  const h = row.map(up);
  const desc = h.flatMap((x, i) => (x === "DESCRIPTION" ? [i] : []));
  if (desc.length < 2 || !h[0]?.includes("ARTICLE")) return null;
  const local = (i: number) => !h[i].startsWith("BATAM");
  const after = h.findIndex((x, i) => x.startsWith("HARGA SETELAH") && local(i));
  const total = h.findIndex((x, i) => x.startsWith("TOTAL HARGA") && local(i));
  const between = h.map((_, i) => i).filter((i) => i > total && i < after && local(i));
  const cashback = between.find((i) => h[i].includes("PWP")) ?? between[0] ?? -1;
  const price = (from: number, to: number) => h.findIndex((x, i) => i > from && i < to && x.startsWith("CURRENT PRICE") && local(i));
  const accArt = h.findIndex((x, i) => i > desc[0] && x.includes("ARTICLE"));
  const c: Cols = { devArt: 0, devDesc: desc[0], devPrice: price(desc[0], accArt), accArt, accDesc: desc[1], accPrice: price(desc[1], h.length), total, cashback, after, br: h.findIndex((x) => x === "BR") };
  return c.after < 0 || c.cashback < 0 || c.accArt < 0 || c.devPrice < 0 || c.accPrice < 0 ? null : c;
}

const idOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pwp";

interface Combo {
  device: PwpDevice;
  items: PwpItem[];
  total: number | null;
  cashback: number;
  after: number | null;
  br: string;
}

/** One sheet of the PWP workbook, or null when it has no PWP table. */
export function parsePwpSheet(g: SheetGrid, year: number): { program: PwpProgram; warnings: string[] } | null {
  const hi = g.rows.findIndex((r) => !!colsOf(r ?? []));
  if (hi < 0) return null;
  const c = colsOf(g.rows[hi])!;
  const label = (k: RegExp) => text(g.rows.slice(0, hi).find((r) => k.test(up(r?.[0])))?.[1]);
  const title = text(g.rows.slice(0, hi).map((r) => r?.[0]).find((x) => /PWP|PROMO/i.test(text(x)))) || g.name;
  const br = label(/^NO\.? ?BR/);
  const period = label(/^PERIODE/);

  const combos: Combo[] = [];
  for (const row of g.rows.slice(hi + 1)) {
    if (!row) continue;
    const devArt = up(row[c.devArt]);
    const accArt = up(row[c.accArt]);
    const accDesc = text(row[c.accDesc]);
    if (!devArt) {
      // a bundle continues on the next rows: another code of the same item, or another item
      const last = combos[combos.length - 1];
      if (!last || !accArt) continue;
      const same = last.items.find((it) => it.description.toUpperCase() === accDesc.toUpperCase());
      if (same) same.articles.includes(accArt) || same.articles.push(accArt);
      else last.items.push({ articles: [accArt], description: accDesc, price: money(row[c.accPrice]) ?? 0 });
      continue;
    }
    if (!accArt || !/[A-Z]/.test(devArt)) continue;
    combos.push({
      device: { article: devArt, description: text(row[c.devDesc]), price: money(row[c.devPrice]) ?? 0 },
      items: [{ articles: [accArt], description: accDesc, price: money(row[c.accPrice]) ?? 0 }],
      total: money(row[c.total]),
      cashback: money(row[c.cashback]) ?? 0,
      after: money(row[c.after]),
      br: c.br >= 0 ? text(row[c.br]) : br,
    });
  }
  if (!combos.length) return null;

  const warnings: string[] = [];
  let badTotal = 0;
  let badAfter = 0;
  const devices: PwpDevice[] = [];
  const devIdx = new Map<string, number>();
  const offers: PwpOffer[] = [];
  const offerIdx = new Map<string, number>();
  for (const k of combos) {
    const sum = k.device.price + k.items.reduce((a, it) => a + it.price, 0);
    if (k.total != null && k.total !== sum) badTotal++;
    if (k.after != null && k.after !== (k.total ?? sum) - k.cashback) badAfter++;
    let d = devIdx.get(k.device.article);
    if (d == null) {
      d = devices.length;
      devIdx.set(k.device.article, d);
      devices.push(k.device);
    }
    const key = `${k.items.map((it) => `${it.description.toUpperCase()}@${it.price}`).join("+")}|${k.cashback}|${k.br}`;
    let o = offerIdx.get(key);
    if (o == null) {
      o = offers.length;
      offerIdx.set(key, o);
      offers.push({ items: k.items.map((it) => ({ ...it, articles: [...it.articles] })), cashback: k.cashback, br: k.br.replace(/\s+/g, " "), codes: mopCodes(k.br), devices: [] });
    } else {
      // the same item may come with other article codes on other rows
      offers[o].items.forEach((it, i) => k.items[i]?.articles.forEach((a) => it.articles.includes(a) || it.articles.push(a)));
    }
    if (!offers[o].devices.includes(d)) offers[o].devices.push(d);
  }
  if (badTotal) warnings.push(`${g.name}: ${badTotal} baris "Total harga sebelum cashback" tidak sama dengan harga HP + aksesoris.`);
  if (badAfter) warnings.push(`${g.name}: ${badAfter} baris "Harga setelah cashback" tidak sama dengan total − cashback.`);
  const byPrice = new Map<number, number>();
  for (const d of devices) byPrice.set(d.price, (byPrice.get(d.price) ?? 0) + 1);
  const [samePrice, same] = [...byPrice].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  if (devices.length >= 6 && same >= devices.length * 0.7 && new Set(devices.map((d) => d.description.split(" ").slice(0, 3).join(" "))).size >= 4)
    warnings.push(`${g.name}: ${same} dari ${devices.length} HP tertulis dengan harga sama (${samePrice.toLocaleString("id-ID")}) padahal modelnya berbeda — kemungkinan salah ketik, dashboard memakai harga Price List.`);

  const program: PwpProgram = {
    id: idOf(g.name),
    sheet: g.name,
    title: title.replace(/\s+/g, " "),
    brand: brandOf([title, ...devices.slice(0, 3).map((d) => d.description)]),
    br: br.replace(/\s+/g, " "),
    period,
    ranges: pwpRanges(period, year),
    devices,
    offers,
  };
  return { program, warnings };
}

/** Every PWP sheet of the workbook. */
export function parsePwpPromo(sheets: SheetGrid[], opts: { title: string; year?: number }) {
  const year = opts.year ?? Number(opts.title.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getFullYear());
  const programs: PwpProgram[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  for (const g of sheets) {
    const r = parsePwpSheet(g, year);
    if (!r) continue;
    let id = r.program.id;
    for (let n = 2; ids.has(id); n++) id = `${r.program.id}-${n}`;
    ids.add(id);
    programs.push({ ...r.program, id });
    warnings.push(...r.warnings);
    if (!r.program.ranges.length) warnings.push(`${g.name}: periode "${r.program.period}" tidak terbaca — dianggap selalu aktif.`);
  }
  return { title: opts.title, programs, warnings };
}
