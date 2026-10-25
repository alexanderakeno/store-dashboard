import { appleCategory, appleCategoryRank, appleLabel, appleName } from "./applePricelist";
import { clean, dedupeItems, priceListDate, type PriceListParse } from "./pricelist";
import type { Sheet } from "./androidXlsx";
import type { PriceItem } from "@/types/pricelist";

const up = (v: unknown) => clean(String(v ?? "")).toUpperCase();
const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : NaN;
  const s = String(v ?? "").replace(/[^\d-]/g, "");
  return s ? Number(s) : NaN;
};

/** Words that tell models apart — never treated as a colour even when they differ inside a price group. */
const KEEP = new Set(["PRO", "MAX", "AIR", "MINI", "PLUS", "ULTRA", "SE", "WI-FI", "WIFI", "CELLULAR", "CELL", "GPS", "NANO", "STUDIO", "E"]);
/** Tokens with a digit (storage, chip, size: 256GB, M4, 13.6, 44, 8C) define the type, not the colour. */
const fixed = (t: string) => /\d/.test(t) || KEEP.has(t);

interface Tok {
  sep: string;
  t: string;
}
/** "MBA 13.6 SPG/8C GPU" → [MBA][ 13.6][ SPG][/8C][ GPU] (each word keeps the separator before it). */
function tokens(desc: string): Tok[] {
  const out: Tok[] = [];
  const re = /([\s/]*)([^\s/]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc))) out.push({ sep: out.length ? (m[1].includes("/") ? "/" : " ") : "", t: m[2] });
  return out;
}
const join = (ts: Tok[]) => ts.map((x, i) => (i ? x.sep : "") + x.t).join("").trim();

/** Series title as shown: "MBA M5 2026" → "MacBook Air M5 2026", "Mackbook Pro M4 2025" → "MacBook Pro M4 2025", "AW ULTRA2 2024" → "Apple Watch Ultra2 2024". */
function seriesLabel(raw: string): string {
  return appleLabel(raw)
    .replace(/\bMba\b/g, "MacBook Air")
    .replace(/\bMbp\b/g, "MacBook Pro")
    .replace(/\bMbn\b/g, "MBN")
    .replace(/\bMa(?:ck|c)book\b/gi, "MacBook")
    .replace(/^AW\b/, "Apple Watch")
    .replace(/\bNpi\b/, "NPI");
}

/** True when the workbook is the Apple (DIGIMAP / DIGIPLUS) Excel price list. */
export function isApplePriceListXlsx(sheets: Sheet[]): boolean {
  return sheets.some((s) => header(s.rows) !== null && s.rows.slice(0, 15).some((r) => (r ?? []).some((c) => /APPLE DEVICE/i.test(String(c ?? "")))));
}

function header(rows: unknown[][]): { at: number; col: Record<string, number> } | null {
  const need: Record<string, RegExp> = { article: /^SAP\s*ARTICLE$/, desc: /^SAP\s*DESCRIPTION$/, normal: /^NORMAL\s*PRICE$/, promo: /^PROMOTION\s*PRICE$/ };
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] ?? []).map(up);
    const col: Record<string, number> = {};
    for (const [k, re] of Object.entries(need)) {
      const j = cells.findIndex((c) => re.test(c));
      if (j >= 0) col[k] = j;
    }
    if (Object.keys(col).length < 4) continue;
    col.category = cells.findIndex((c) => /^CATEGORY$/.test(c));
    col.remark = cells.findIndex((c) => /^REMARKS?$/.test(c));
    col.eol = cells.findIndex((c) => /^EOL/.test(c));
    return { at: i, col };
  }
  return null;
}

/**
 * Apple Excel price list ("PRICE LIST DIGIMAP … - Further Notice.xlsx", sheet "PRICE LIST APPLE DEVICE"):
 * series title rows ("IPHONE 17", "iPad Air M4 (11\")") followed by one row per article (colour) —
 * SAP Article · SAP Description · Category · Normal Price · Promotion Price · … · Remarks · … · EOL Status.
 *
 * Articles of one series with the same prices and status are one price-list row; its name is the description
 * without the colour (the words that differ between those articles, e.g. "SILVER" / "COSMIC ORANGE", "SPG" / "SLV").
 * A type sold in one colour only loses the colour words learned from the other types. Articles are kept so stock is
 * matched by article code. The file has no installment (cicilan) price and no Qoala table: the stored Qoala stays.
 */
export function parseApplePriceListXlsx(sheets: Sheet[]): PriceListParse {
  const warnings: string[] = [];
  const sheet = sheets.find((s) => header(s.rows) && /APPLE/i.test(s.name)) ?? sheets.find((s) => header(s.rows));
  const h = sheet ? header(sheet.rows) : null;
  const title = sheet ? sheet.rows.slice(0, 5).flat().map((c) => clean(String(c ?? ""))).find((c) => /PRICE\s*LIST/i.test(c)) ?? "" : "";
  const date = priceListDate(title);
  if (!sheet || !h) {
    warnings.push('Kolom "SAP Article · SAPDescription · Normal Price · Promotion Price" tidak ditemukan — bukan file price list Apple?');
    return { date, title, items: [], qoala: [], kinds: [], warnings };
  }
  const { col } = h;

  type Row = { order: number; series: string; article: string; desc: string; normal: number; promo: number; status: string; remark: string };
  const list: Row[] = [];
  let series = "";
  let skipped = 0;
  for (const r of sheet.rows.slice(h.at + 1)) {
    const article = up(r[col.article]);
    const desc = up(r[col.desc]);
    if (article && !desc) {
      series = seriesLabel(String(r[col.article]));
      continue;
    }
    if (!article || !desc) continue;
    const normal = num(r[col.normal]);
    const promo0 = num(r[col.promo]);
    if (!Number.isFinite(normal) || normal <= 0) {
      skipped++;
      continue;
    }
    // no promotion price → the normal price applies
    const promo = Number.isFinite(promo0) && promo0 > 0 ? promo0 : normal;
    const eol = col.eol >= 0 ? up(r[col.eol]) : "";
    const remark = col.remark >= 0 ? clean(String(r[col.remark] ?? "")) : "";
    // "-IND" / "-PAC" region suffixes are not part of the type
    const d = desc.replace(/\(PRODUCT\)\s*/g, "").replace(/[()]/g, " ").replace(/-(IND|PAC)\b/g, "").replace(/\s+/g, " ").trim();
    list.push({ order: list.length, series: series || "Apple", article, desc: d, normal, promo, status: /EOL/.test(eol) ? "EOL" : "ACTIVE", remark });
  }

  // one group per series + prices + status + type-defining tokens
  const groups = new Map<string, Row[]>();
  for (const x of list) {
    const k = [x.series, x.normal, x.promo, x.status, tokens(x.desc).filter((t) => fixed(t.t)).map((t) => t.t).join(" ")].join("|");
    groups.set(k, [...(groups.get(k) ?? []), x]);
  }

  // name = tokens shared by every article of the group; what differs is the colour (learned for single-colour types)
  const colours = new Set<string>();
  const named = new Map<Row[], string>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const ts = g.map((x) => tokens(x.desc));
    const sameLen = ts.every((t) => t.length === ts[0].length);
    let keep: Tok[];
    if (sameLen) keep = ts[0].filter((t, i) => ts.every((o) => o[i].t === t.t) || fixed(t.t));
    else {
      // "… 2TB SP BLK NT" vs "… 2TB SILVER NT": shared start + shared end (NT = nano-texture glass)
      const min = Math.min(...ts.map((o) => o.length));
      let p = 0;
      while (p < min && ts.every((o) => o[p].t === ts[0][p].t)) p++;
      let e = 0;
      while (p + e < min && ts.every((o) => o[o.length - 1 - e].t === ts[0][ts[0].length - 1 - e].t)) e++;
      keep = [...ts[0].slice(0, p), ...ts[0].slice(ts[0].length - e)];
    }
    const kept = new Set(keep.map((t) => t.t));
    for (const t of ts.flat()) if (!kept.has(t.t) && !fixed(t.t)) colours.add(t.t);
    named.set(g, join(keep));
  }
  for (const g of groups.values()) {
    if (named.has(g)) continue;
    const ts = tokens(g[0].desc);
    const keep = ts.filter((t) => fixed(t.t) || !colours.has(t.t));
    named.set(g, join(keep.length ? keep : ts));
  }

  // "IPHONE 16 PRO 256GB NATURAL TITANIUM": the colour family left at the end of the name
  for (const [g, n] of named) named.set(g, n.replace(/\s+TITANIUM$/, ""));
  // same name twice in a series (one colour priced differently) → the smaller group shows its colours
  const bySeries = new Map<string, Row[][]>();
  for (const g of groups.values()) {
    const k = `${g[0].series}|${named.get(g)}`;
    bySeries.set(k, [...(bySeries.get(k) ?? []), g]);
  }
  for (const gs of bySeries.values()) {
    if (gs.length < 2) continue;
    const main = [...gs].sort((a, b) => b.length - a.length)[0];
    for (const g of gs) {
      if (g === main) continue;
      const base = new Set(tokens(named.get(g)!).map((t) => t.t));
      const extra = [...new Set(g.flatMap((r) => tokens(r.desc).map((t) => t.t)).filter((t) => !base.has(t) && t !== "TITANIUM"))];
      if (extra.length) named.set(g, `${named.get(g)} (${extra.join(" ")})`);
    }
  }

  const items: Array<PriceItem & { order: number }> = [];
  for (const g of groups.values()) {
    const x = g[0];
    const { name, note: colourNote } = appleName(named.get(g)!);
    const brand = appleCategory(x.series, name);
    // iPhone titles cover several models ("iPhone 16 Series": 16e, 16, Plus, Pro, Pro Max) → one model per name
    // without the storage, like the PDF's Product labels; iPad / Mac / Watch titles are already one model
    const series = brand === "iPhone" ? name.replace(/\s+\d+(?:GB|TB)\b.*$/i, "") || x.series : x.series;
    const remarks = [...new Set(g.map((r) => r.remark).filter((r) => r && r !== "0"))];
    items.push({
      order: x.order,
      kind: "apple",
      brand,
      series,
      name,
      normal: x.normal,
      promo: x.promo,
      status: x.status,
      ...(() => {
        const note = [colourNote, ...(x.promo < x.normal ? remarks : [])].filter(Boolean).join(" · ").slice(0, 400);
        return note ? { note } : {};
      })(),
      articles: g.map((r) => r.article).slice(0, 60),
    });
  }
  items.sort((a, b) => appleCategoryRank(a.brand) - appleCategoryRank(b.brand) || a.order - b.order);
  const out: PriceItem[] = items.map(({ order: _o, ...it }) => it);
  dedupeItems(out, warnings);
  if (skipped) warnings.push(`${skipped} baris tanpa harga normal dilewati.`);
  const odd = out.filter((x) => x.promo > x.normal);
  if (odd.length) warnings.push(`${odd.length} tipe harga promo lebih tinggi dari harga normal: ${odd.slice(0, 3).map((x) => x.name).join(", ")}`);
  return { date, title, items: out, qoala: [], kinds: out.length ? ["apple"] : [], warnings };
}
