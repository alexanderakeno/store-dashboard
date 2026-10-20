import type { PdfText } from "./soh";
import { clean, dedupeItems, isPrice, priceListDate, rows, toNum, type PriceListParse } from "./pricelist";
import type { PriceItem, QoalaTier } from "@/types/pricelist";

/**
 * Apple price list PDF ("DIGIPLUS PRICE LIST …", PT. MAP ZONA ADIPERKASA) — always comes as 2 files
 * (Mac/Watch/iPad Air… and iPad mini/Pro/iPhone + Qoala). One table per page:
 *
 *   Product (merged cell, label centred) | Description | Normal Price | Promotion Cicilan Price | Promotion Cash Price
 *
 * The Product label is vertically centred over its rows, so rows are assigned to labels by splitting the
 * row list into consecutive runs whose middle sits on the label. Layout comes from header labels, not positions.
 */

const CATEGORY_ORDER = ["iPhone", "iPad", "Mac", "Apple Watch", "AirPods", "Apple"];

/** iPhone / iPad / Mac / Apple Watch — used as the "brand" chips of the Apple tab. */
export function appleCategory(series: string, name: string): string {
  const u = `${series} ${name}`.toUpperCase();
  if (/IPHONE/.test(u)) return "iPhone";
  if (/IPAD/.test(u)) return "iPad";
  if (/WATCH/.test(u)) return "Apple Watch";
  if (/AIRPODS/.test(u)) return "AirPods";
  if (/\b(MAC|MACBOOK|IMAC|MBA|MBP|MBN)\b/.test(u)) return "Mac";
  return "Apple";
}
export const appleCategoryRank = (c: string) => {
  const i = CATEGORY_ORDER.indexOf(c);
  return i < 0 ? CATEGORY_ORDER.length : i;
};

const WORDS: Record<string, string> = { IPHONE: "iPhone", IPAD: "iPad", IMAC: "iMac", MACBOOK: "MacBook", AIRPODS: "AirPods" };

/** Product label as shown in the app: "Iphone 16e" → "iPhone 16e", "IPAD AIR 11 M3" → "iPad Air 11 M3", "iMAC 24 Inch" → "iMac 24 Inch". */
export function appleLabel(s: string): string {
  return clean(s)
    .split(" ")
    .map((w) => {
      const u = w.toUpperCase();
      if (WORDS[u]) return WORDS[u];
      if (/^\d+(E|ST|ND|RD|TH)$/.test(u)) return u.toLowerCase(); // 16e, 2nd, 11th
      if (/\d/.test(w) || w.length <= 2) return u; // M5, 13.6, SE, &
      return u.charAt(0) + u.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Description cleanup: colours in brackets → `note`, PDF typos fixed ("IIMAC", "Pro512GB", "1TB(Sky"). */
export function appleName(raw: string): { name: string; note: string } {
  const notes: string[] = [];
  let s = raw.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    notes.push(clean(inner).replace(/\s*,\s*/g, ", "));
    return " ";
  });
  s = s
    .replace(/\bIIMAC\b/gi, "IMAC")
    .replace(/-IND\b/gi, "")
    .replace(/([A-Za-z])(\d+(?:GB|TB))\b/g, "$1 $2")
    .replace(/\s+-\s*$/, "");
  return { name: iphoneName(clean(s)), note: notes.filter(Boolean).join(" · ") };
}

/** "IPHONE 17E 256GB" → "iPhone 17e 256GB", like the other iPhone rows of the PDF. Other names are left as printed. */
export function iphoneName(name: string): string {
  if (!/^IPHONE\b/.test(name) || /[a-z]/.test(name)) return name;
  const W: Record<string, string> = { IPHONE: "iPhone", PRO: "Pro", MAX: "Max", PLUS: "Plus", AIR: "Air", MINI: "mini" };
  return name
    .split(" ")
    .map((w) => W[w] ?? w.replace(/^(\d+)E$/, "$1e"))
    .join(" ");
}

const HEADER = /^(product|description|normal\s*price|promotion.*|cicilan(\s*price)?|cash(\s*price)?|price)$/i;

/** True when the PDF looks like the Apple price list (Description + Cash/Cicilan price columns). */
export function isApplePriceListPdf(texts: PdfText[]): boolean {
  const s = texts.map((t) => clean(t.str).toLowerCase());
  return s.some((x) => x === "description") && s.some((x) => /cash|cicilan/.test(x)) && s.some((x) => /^normal\s*price$/.test(x));
}

/** Splits rows (top → bottom) into consecutive runs, one per label, each centred on its label. */
export function assignGroups(rowY: number[], labels: Array<{ y: number; str: string }>): string[] {
  const out = new Array<string>(rowY.length).fill("");
  let s = 0;
  labels.forEach((l, i) => {
    if (s >= rowY.length) return;
    let e = s;
    let best = Infinity;
    for (let k = s; k < rowY.length; k++) {
      const d = Math.abs((rowY[s] + rowY[k]) / 2 - l.y);
      if (d < best - 1e-6) {
        best = d;
        e = k;
      } else if (d > best + 1e-6) break;
    }
    if (i === labels.length - 1) e = rowY.length - 1;
    for (let k = s; k <= e; k++) out[k] = l.str;
    s = e + 1;
  });
  return out;
}

const mode = (xs: number[]) => {
  const n = new Map<number, number>();
  for (const x of xs) n.set(Math.round(x), (n.get(Math.round(x)) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
};

export function parseApplePriceListPdf(input: PdfText[]): PriceListParse {
  const texts = input.map((t) => ({ ...t, str: clean(t.str) })).filter((t) => t.str);
  const warnings: string[] = [];
  const top = texts.filter((t) => t.page === 1).sort((a, b) => b.y - a.y || a.x - b.x);
  const title = top.slice(0, 6).find((t) => /price\s*list/i.test(t.str))?.str ?? top[0]?.str ?? "";
  const date = top.slice(0, 6).map((t) => priceListDate(t.str)).find(Boolean) ?? null;
  const items: PriceItem[] = [];
  const qoala: QoalaTier[] = [];

  for (const page of [...new Set(texts.map((t) => t.page))].sort((a, b) => a - b)) {
    const onPage = texts.filter((t) => t.page === page);
    const normal = onPage.filter((t) => /^normal\s*price$/i.test(t.str)).sort((a, b) => b.y - a.y)[0];
    if (!normal) continue;
    const head = onPage.filter((t) => HEADER.test(t.str) && Math.abs(t.y - normal.y) <= 12);
    const headBottom = Math.min(...head.map((t) => t.y));
    // the Qoala table (page 2) ends the price rows
    const qoalaTop = Math.max(-Infinity, ...onPage.filter((t) => t.y < headBottom && /qoala|harga unit gadget/i.test(t.str)).map((t) => t.y));
    const body = onPage.filter((t) => t.y < headBottom - 1 && t.y > qoalaTop + 1);

    // description column = most common x of the text left of the prices on rows that carry prices
    const bodyRows = rows(body);
    const descX = mode(bodyRows.filter((r) => r.some((t) => isPrice(t.str))).flatMap((r) => r.filter((t) => !isPrice(t.str) && t.x < normal.x).map((t) => t.x)));
    if (descX == null) continue;

    // Product labels (left column); runs on the same baseline are one label
    const labels: Array<{ y: number; str: string }> = [];
    for (const t of body.filter((t) => t.x < descX - 3 && !isPrice(t.str)).sort((a, b) => b.y - a.y || a.x - b.x)) {
      const prev = labels[labels.length - 1];
      if (prev && Math.abs(prev.y - t.y) <= 0.5) prev.str += ` ${t.str}`;
      else labels.push({ y: t.y, str: t.str });
    }

    // item rows: description + up to 3 prices
    type Row = { y: number; h: number; name: string; nums: number[] };
    let list: Row[] = rows(body.filter((t) => t.x >= descX - 3)).map((r) => ({
      y: r[0].y,
      h: r[0].h || 7,
      name: clean(r.filter((t) => !isPrice(t.str)).map((t) => t.str).join(" ")),
      nums: r.filter((t) => isPrice(t.str)).sort((a, b) => a.x - b.x).map((t) => toNum(t.str)),
    }));
    // a description printed a little off its prices' baseline → join with the nearest orphan
    for (const r of list) {
      if (!r.name || r.nums.length) continue;
      const mate = list.filter((o) => !o.name && o.nums.length && Math.abs(o.y - r.y) <= r.h * 1.5).sort((a, b) => Math.abs(a.y - r.y) - Math.abs(b.y - r.y))[0];
      if (mate) {
        mate.name = r.name;
        r.name = "";
      }
    }
    const noPrice = list.filter((r) => r.name && !r.nums.length);
    if (noPrice.length) warnings.push(`${noPrice.length} baris tanpa harga dilewati: ${noPrice.slice(0, 3).map((r) => r.name).join(", ")}`);
    list = list.filter((r) => r.name && r.nums.length).sort((a, b) => b.y - a.y);

    const groups = labels.length ? assignGroups(list.map((r) => r.y), labels) : list.map(() => "Apple");
    // each label should sit in the middle of its rows — if not, the PDF layout changed: say so
    const lineH = list[0]?.h ?? 7;
    const off = labels.filter((l) => {
      const ys = list.filter((_, i) => groups[i] === l.str).map((r) => r.y);
      return !ys.length || Math.abs((ys[0] + ys[ys.length - 1]) / 2 - l.y) > lineH * 1.2;
    });
    if (off.length) warnings.push(`Pengelompokan tipe mungkin meleset di halaman ${page}: ${off.slice(0, 3).map((l) => l.str).join(", ")} — cek hasilnya di Price List.`);
    list.forEach((r, i) => {
      const { name, note } = appleName(r.name);
      const series = appleLabel(groups[i] || "Apple");
      const normalPrice = r.nums[0];
      const credit = r.nums[1] ?? normalPrice;
      const cash = r.nums[2] ?? credit;
      items.push({ kind: "apple", brand: appleCategory(series, name), series, name, normal: normalPrice, promo: cash, credit, note, status: "ACTIVE" });
    });

    // Qoala table: "RP 0 - RP 3.000.000 | KLABRONZE | Rp 200.000 | Rp 250.000 | Rp 280.000"
    if (qoalaTop > -Infinity) {
      const mid = (t: PdfText) => t.x + (t.w || 0) / 2;
      let tenors: Array<{ m: string; x: number }> = [];
      for (const r of rows(onPage.filter((t) => t.y <= qoalaTop + 1))) {
        const words = r.filter((t) => !isPrice(t.str));
        const nums = r.filter((t) => isPrice(t.str)).sort((a, b) => a.x - b.x);
        const months = words.filter((w) => /^\d+\s*(months?|bulan)$/i.test(w.str));
        if (months.length && !nums.length) {
          tenors = months.map((w) => ({ m: String(Number(/\d+/.exec(w.str)![0])), x: mid(w) }));
          continue;
        }
        const tier = words.find((w) => /^KLA/i.test(w.str));
        const range = words.find((w) => /rp\s*[\d.]+\s*-\s*rp/i.test(w.str));
        if (!tier || !nums.length) continue;
        // a fee belongs to the tenor column it sits under (a row may skip a column)
        const keyOf = (n: PdfText, k: number) => (tenors.length ? [...tenors].sort((a, b) => Math.abs(a.x - mid(n)) - Math.abs(b.x - mid(n)))[0].m : ["12", "18", "24"][k] ?? String(k));
        qoala.push({
          tier: tier.str.toUpperCase(),
          range: range ? range.str.replace(/rp/gi, "Rp").replace(/\s*-\s*/, " - ") : "",
          fees: Object.fromEntries(nums.map((n, k) => [keyOf(n, k), toNum(n.str)])),
        });
      }
    }
  }

  dedupeItems(items, warnings);
  if (!items.length) warnings.push('Header "Description / Normal Price / Cash Price" tidak ditemukan — bukan PDF price list Apple?');
  const odd = items.filter((x) => x.promo > x.normal);
  if (odd.length) warnings.push(`${odd.length} tipe harga promo lebih tinggi dari harga normal (cek PDF): ${odd.slice(0, 3).map((x) => x.name).join(", ")}${odd.length > 3 ? ", …" : ""}`);
  return { date, title, items, qoala, kinds: items.length ? ["apple"] : [], warnings };
}

/** Joins the 2 Apple PDFs into one list: iPhone → iPad → Mac → Watch, file order kept inside a category. */
export function mergeApple(parts: PriceListParse[]): PriceListParse {
  const items = parts
    .flatMap((p) => p.items)
    .map((it, i) => ({ it, i }))
    .sort((a, b) => appleCategoryRank(a.it.brand) - appleCategoryRank(b.it.brand) || a.i - b.i)
    .map((x) => x.it);
  const dates = [...new Set(parts.map((p) => p.date).filter((d): d is string => !!d))].sort();
  const warnings = parts.flatMap((p) => p.warnings);
  if (dates.length > 1) warnings.push(`Tanggal kedua PDF berbeda (${dates.join(" vs ")}) — dipakai yang terbaru.`);
  const qoala = [...parts].reverse().find((p) => p.qoala.length)?.qoala ?? [];
  return { date: dates[dates.length - 1] ?? null, title: parts.find((p) => p.title)?.title ?? "", items, qoala, kinds: items.length ? ["apple"] : [], warnings };
}
