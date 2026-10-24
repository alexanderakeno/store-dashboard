import type { PromoArticle, PromoKind, PromoPair, PromoProgram, PromoRange, PromoSheet, SamsungPromo } from "@/types/samsungPromo";

export type Cell = string | number | boolean | null | undefined;
export interface SheetGrid {
  name: string;
  rows: Cell[][];
}

const MONTHS: Record<string, number> = {
  JANUARI: 1, JANUARY: 1, JAN: 1, FEBRUARI: 2, FEBRUARY: 2, FEB: 2, MARET: 3, MARCH: 3, MAR: 3, APRIL: 4, APR: 4, MEI: 5, MAY: 5,
  JUNI: 6, JUNE: 6, JUN: 6, JULI: 7, JULY: 7, JUL: 7, AGUSTUS: 8, AUGUST: 8, AGU: 8, AGS: 8, AUG: 8, SEPTEMBER: 9, SEP: 9, SEPT: 9,
  OKTOBER: 10, OCTOBER: 10, OKT: 10, OCT: 10, NOVEMBER: 11, NOV: 11, DESEMBER: 12, DECEMBER: 12, DES: 12, DEC: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const text = (c: Cell) => (c == null ? "" : String(c)).replace(/\s+/g, " ").trim();
const up = (c: Cell) => text(c).toUpperCase();

/**
 * Date ranges in a period text: "16 - 31 OKTOBER 2026", "Tgl 24-25 Oktober 2026",
 * "TGL 23-25 OKTOBER, & TGL 30 OKTOBER - 1 NOVEMBER 2026", "16 SEPTEMBER - 31 DESEMBER 2026",
 * "TGL 23-25 0KTOBER 2026" (zero for O). Ranges without a year take the next year written after
 * them, else `year`.
 */
export function parseRanges(s: string, year: number): PromoRange[] {
  const t = ` ${s.toUpperCase().replace(/\b0KTOBER\b/g, "OKTOBER")} `;
  const re = new RegExp(`(\\d{1,2})\\s*(${MONTH_RE})?\\s*(?:-|S\\/D|SAMPAI(?: DENGAN)?|HINGGA)\\s*(\\d{1,2})\\s*(${MONTH_RE})\\b`, "g");
  const out: PromoRange[] = [];
  for (const m of t.matchAll(re)) {
    const after = t.slice((m.index ?? 0) + m[0].length);
    const yy = after.match(/^\s*,?\s*(\d{4})\b/) ?? after.match(/\b(20\d{2})\b/);
    const y = yy ? Number(yy[1]) : year;
    const m2 = MONTHS[m[4]];
    const m1 = m[2] ? MONTHS[m[2]] : m2;
    const d1 = Number(m[1]);
    const d2 = Number(m[3]);
    if (!d1 || !d2 || d1 > 31 || d2 > 31) continue;
    out.push({ from: iso(m1 > m2 ? y - 1 : y, m1, d1), to: iso(y, m2, d2) });
  }
  return out;
}

/** Article codes look like "SSUSM-S741BZVCXID", "SSUUA32H5000FKLXD", "SSUSM-A085FZGG1". */
const ARTICLE = /^[A-Z]{3}[A-Z0-9]{1,3}-?[A-Z0-9]{4,}$/;
const isArticle = (c: Cell) => ARTICLE.test(up(c)) && /\d/.test(up(c));

/** "KODE PROMO MOP SSC UNTUK PWP S26 : PWPS26BASE" → "PWPS26BASE". */
export function promoCode(c: Cell): string {
  const s = up(c);
  if (!s) return "";
  const tail = s.includes(":") ? s.slice(s.lastIndexOf(":") + 1) : s;
  return tail.match(/\b[A-Z0-9]*[A-Z][A-Z0-9]*\d[A-Z0-9]*\b|\b[A-Z]{5,}[A-Z0-9]*\b/)?.[0] ?? "";
}

const money = (c: Cell): number | null => {
  if (typeof c === "number" && Number.isFinite(c)) return Math.round(c);
  const s = text(c).replace(/[^\d.,]/g, "");
  if (!s) return null;
  const n = Number(s.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export function kindOfSheet(name: string): PromoKind {
  const n = name.toUpperCase();
  if (/ADD|TAMBAHAN/.test(n) && /TRADE/.test(n)) return "TAMBAHAN TRADE IN";
  if (/TRADE ?IN/.test(n)) return "TRADE IN";
  if (/\bEIP\b/.test(n)) return "EIP";
  if (/\bPWP\b/.test(n)) return "PWP";
  return "LAIN";
}

interface Group {
  article: number;
  desc: number;
  value: number;
  code: number;
  normal: number;
  period: number;
}

/** Column roles of a table header row (null when the row is not a table header). */
function headerOf(row: Cell[]): Group[] | null {
  const role = (c: Cell): keyof Group | null => {
    const s = up(c);
    if (!s || s.length > 60 || /SYARAT|KETENTUAN/.test(s)) return null;
    if (/\bKODE\b/.test(s) && /PROMO|MOP/.test(s)) return "code";
    if (/HARGA NORMAL/.test(s)) return "normal";
    if (/^PERIODE/.test(s)) return "period";
    if (/DESC/.test(s)) return "desc";
    if (/ARTI[KC]LE?\b|ARTIKEL|\bSKU\b/.test(s)) return "article";
    if (/CASHBACK|NILAI|NOMINAL|^PROMO /.test(s)) return "value";
    return null;
  };
  const roles = row.map(role);
  const arts = roles.flatMap((r, i) => (r === "article" ? [i] : []));
  if (!arts.length || !roles.includes("desc")) return null;
  const find = (r: keyof Group) => roles.findIndex((x) => x === r);
  return arts.map((a, k) => {
    // a group's description is the first description column right of its article column
    const desc = roles.findIndex((x, i) => x === "desc" && i > a && (k === arts.length - 1 || i < arts[k + 1]));
    return { article: a, desc, value: k === 0 ? find("value") : -1, code: k === 0 ? find("code") : -1, normal: k === 0 ? find("normal") : -1, period: k === 0 ? find("period") : -1 };
  });
}

/** A detail sheet: promo articles (with value/code), PWP pair items, and the remaining text as notes. */
function parseSheet(g: SheetGrid, year: number): { sheet: PromoSheet; articles: PromoArticle[]; pairs: PromoPair[] } {
  const kind = kindOfSheet(g.name);
  const used = new Set<string>();
  const articles: PromoArticle[] = [];
  const pairs: PromoPair[] = [];
  let firstTable: number | null = null;
  for (let r = 0; r < g.rows.length; r++) {
    const head = headerOf(g.rows[r] ?? []);
    if (!head) continue;
    head.forEach((h) => Object.values(h).forEach((c) => c >= 0 && used.add(`${r}:${c}`)));
    const main = head[0].value >= 0 || head[0].code >= 0;
    let value: number | null = null;
    let code = "";
    let period: PromoRange[] | null = null;
    let gap = 0;
    const before = pairs.length;
    let rr = r + 1;
    for (; rr < g.rows.length && gap < 2; rr++) {
      const row = g.rows[rr] ?? [];
      if (headerOf(row)) break;
      let any = false;
      head.forEach((h, k) => {
        if (!isArticle(row[h.article])) return;
        any = true;
        const article = up(row[h.article]);
        const description = h.desc >= 0 ? text(row[h.desc]) : "";
        for (const c of [h.article, h.desc]) if (c >= 0) used.add(`${rr}:${c}`);
        if (main && k === 0) {
          // merged cells: value / code / period are written once for a block of rows
          for (const c of [h.value, h.code, h.normal, h.period]) if (c >= 0) used.add(`${rr}:${c}`);
          value = money(row[h.value]) ?? value;
          code = promoCode(row[h.code]) || code;
          if (h.period >= 0 && text(row[h.period])) period = parseRanges(text(row[h.period]), year);
          articles.push({ sheet: g.name, kind, article, description, value: value ?? 0, code, normal: h.normal >= 0 ? money(row[h.normal]) : null, ranges: period ?? [], stores: [] });
        } else {
          pairs.push({ sheet: g.name, article, description });
        }
      });
      gap = any ? 0 : gap + 1;
    }
    if (!main && firstTable === null) firstTable = pairs.length - before;
  }
  // everything not read as a table is the sheet's text: title, terms
  const notes: string[] = [];
  g.rows.forEach((row, r) => {
    const parts = (row ?? []).map((c, i) => (used.has(`${r}:${i}`) ? "" : text(c))).filter((s) => s && !/^[\d.,]+$/.test(s));
    const line = parts.join(" ").trim();
    if (line.length >= 4) notes.push(line);
  });
  // the sheet's period: the first "periode" line (its date may sit in the next cell of the row)
  const pline = notes.find((n) => /PERIODE/i.test(n) && parseRanges(n, year).length);
  const ranges = pline ? parseRanges(pline, year) : [];
  for (const a of articles) if (!a.ranges.length) a.ranges = ranges;
  // a sheet listing only articles (no value / code column) lists the promo's devices, not PWP pairs
  if (!articles.length && pairs.length && kind !== "LAIN") {
    const table = pairs.splice(0, firstTable ?? pairs.length);
    for (const d of table) articles.push({ sheet: g.name, kind, article: d.article, description: d.description, value: 0, code: "", normal: null, ranges, stores: [] });
  }
  return { sheet: { name: g.name, kind, program: null, ranges, notes }, articles, pairs };
}

/** Rows of the summary sheet (header "JENIS PROMO" · "NAMA PROMO" · "MEKANISME" · "PERIODE" · "KETENTUAN"). */
function parseList(g: SheetGrid, year: number): PromoProgram[] {
  const h = g.rows.findIndex((row) => (row ?? []).some((c) => /JENIS PROMO/.test(up(c))) && (row ?? []).some((c) => /NAMA PROMO/.test(up(c))));
  if (h < 0) return [];
  const col = (re: RegExp) => (g.rows[h] ?? []).findIndex((c) => re.test(up(c)));
  const cNo = col(/^NO/);
  const cType = col(/JENIS PROMO/);
  const cName = col(/NAMA PROMO/);
  const cMech = col(/MEKANISME/);
  const cPer = col(/PERIODE/);
  const cComb = col(/KETENTUAN|PENGGABUNGAN/);
  const out: PromoProgram[] = [];
  for (const row of g.rows.slice(h + 1)) {
    const name = text(row?.[cName]);
    const type = text(row?.[cType]);
    if (!name && !type) continue;
    const mechanism = text(row?.[cMech]);
    const period = text(row?.[cPer]);
    out.push({
      no: Number(row?.[cNo]) || out.length + 1,
      type,
      name,
      mechanism,
      period,
      ranges: parseRanges(period, year),
      combine: cComb >= 0 ? text(row?.[cComb]) : "",
      stores: [...new Set(`${name} ${mechanism}`.toUpperCase().match(/\bQ[A-Z]\d{2}\b/g) ?? [])],
      codes: [...new Set((mechanism.toUpperCase().match(/KODE PROMO\s*:?\s*([A-Z0-9]+)/g) ?? []).map((m) => promoCode(m)).filter(Boolean))],
    });
  }
  return out;
}

/**
 * Samsung promo workbook ("List Promo Aktif Samsung …xlsx"): the summary sheet plus one detail
 * sheet per promo. The detail sheets are the reference for values and codes; codes of the summary
 * that no detail sheet uses are reported as warnings.
 */
export function parseSamsungPromo(sheets: SheetGrid[], opts: { title?: string; year?: number } = {}): Omit<SamsungPromo, "source" | "updatedAt" | "updatedBy"> {
  const title = opts.title ?? "";
  const year = opts.year ?? Number(title.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getFullYear());
  const listSheet = sheets.find((s) => s.rows.some((row) => (row ?? []).some((c) => /JENIS PROMO/.test(up(c)))));
  const programs = listSheet ? parseList(listSheet, year) : [];
  const articles: PromoArticle[] = [];
  const pairs: PromoPair[] = [];
  const out: PromoSheet[] = [];
  for (const s of sheets) {
    if (s === listSheet) continue;
    const r = parseSheet(s, year);
    articles.push(...r.articles);
    pairs.push(...r.pairs);
    out.push(r.sheet);
  }
  // each detail sheet ↔ the summary row that names one of its codes (or whose code its text mentions)
  for (const sh of out) {
    const codes = new Set(articles.filter((a) => a.sheet === sh.name && a.code).map((a) => a.code));
    const body = sh.notes.join(" ").toUpperCase();
    const p = programs.find((x) => x.codes.some((c) => codes.has(c))) ?? programs.find((x) => x.codes.some((c) => body.includes(c))) ?? null;
    sh.program = p?.no ?? null;
    if (!p) continue;
    if (!sh.ranges.length) sh.ranges = p.ranges;
    for (const a of articles)
      if (a.sheet === sh.name) {
        a.stores = p.stores;
        if (!a.ranges.length) a.ranges = p.ranges;
      }
  }
  const detailCodes = new Set(articles.map((a) => a.code).filter(Boolean));
  const warnings: string[] = [];
  for (const p of programs)
    for (const c of p.codes)
      if (!detailCodes.has(c) && articles.length)
        warnings.push(`List no. ${p.no} (${p.type} ${p.name}) menyebut kode ${c}, tapi kode itu tidak ada di sheet detail — dipakai kode & nilai dari sheet detail.`);
  return { title, programs, articles, pairs, sheets: out, warnings };
}
