/**
 * Draws the Weekly / Closing deck (16:9) from ReportData + what the user typed in the pop-up.
 * Same look as the store's Canva deck: white header band, light-blue body, navy titles, dark purple
 * table headers, green / red cells for up / down. Runs in the browser (and in Node for the audit).
 */
import type PptxGenJS from "pptxgenjs";
import { rpShort, type AccVasRow, type ReportData, type SlideId, type StaffRowData } from "@/lib/domain/report";

type Pptx = PptxGenJS;
type Slide = PptxGenJS.Slide;
type Cell = PptxGenJS.TableCell;
type CellOpts = PptxGenJS.TableCellProps;

/** Filter of the "Stock kosong" slide, chosen in the pop-up every time. */
export interface StockFilter {
  /** Unsold for at least this many days before the SOH date. */
  minDays: number;
  /** Sold at least this many units in the 30-day window. */
  minSold: number;
  /** Best sellers per brand (0 = all). */
  perBrand: number;
  /** Brands left out. */
  hide: string[];
}

export const STOCK_FILTER: StockFilter = { minDays: 7, minSold: 1, perBrand: 0, hide: [] };

export interface ReportManual {
  stock: StockFilter;
  author: string;
  skip: SlideId[];
  traffic: { cur: number | null; prev: number | null };
  npi: {
    title1: string;
    title2: string;
    period: string;
    colA: string;
    colB: string;
    rows: Array<{ label: string; a: number | null; b: number | null }>;
    duoTitle: string;
    duo: Array<{ label: string; unit: number | null }>;
    pickup: number | null;
    unboxingLabel: string;
    unboxing: number | null;
  };
  /** Per provider: units per type (a / b) and, when the BNPL menu has nothing, value + contracts typed here. */
  bnpl: { colA: string; colB: string; per: Record<string, { a: number | null; b: number | null; value?: number | null; qty?: number | null }> };
  /** Typed replacements for the auto "Issue" cells ('' = keep the automatic text). */
  issues: string[];
  feedback: string[];
}

export function defaultManual(d: ReportData, author: string): ReportManual {
  const skip: SlideId[] = ["npi"];
  if (!d.bnpl.value) skip.push("bnpl");
  if (!d.ytd.some((r) => r.prev && r.cur)) skip.push("ytd");
  if (!d.stockOut) skip.push("stock");
  return {
    stock: { ...STOCK_FILTER },
    author,
    skip,
    traffic: { cur: null, prev: null },
    npi: {
      title1: "NPI iPhone",
      title2: `${d.monthName} ${d.year}`,
      period: "",
      colA: "Pro",
      colB: "Pro Max",
      rows: ["PO Offline", "PO O2O", "Walk in Reguler", "O2O Reguler"].map((label) => ({ label, a: null, b: null })),
      duoTitle: "",
      duo: [
        { label: "PO Digiplus.co.id", unit: null },
        { label: "VIP", unit: null },
      ],
      pickup: null,
      unboxingLabel: "Unboxing",
      unboxing: null,
    },
    bnpl: { colA: "Pro", colB: "Pro Max", per: {} },
    issues: ["", "", ""],
    feedback: ["", "", ""],
  };
}

/** Saved inputs over the defaults (older saves may miss newer fields). */
export function mergeManual(base: ReportManual, saved: Partial<ReportManual> | null | undefined): ReportManual {
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    traffic: { ...base.traffic, ...(saved.traffic ?? {}) },
    npi: { ...base.npi, ...(saved.npi ?? {}) },
    stock: { ...base.stock, ...(saved.stock ?? {}), hide: Array.isArray(saved.stock?.hide) ? saved.stock.hide : base.stock.hide },
    bnpl: { ...base.bnpl, ...(saved.bnpl ?? {}), per: { ...(saved.bnpl?.per ?? {}) } },
    issues: [0, 1, 2].map((i) => saved.issues?.[i] ?? ""),
    feedback: [0, 1, 2].map((i) => saved.feedback?.[i] ?? ""),
    skip: Array.isArray(saved.skip) ? saved.skip : base.skip,
  };
}

/* ---------------- look ---------------- */

const C = {
  navy: "12305F",
  purple: "1F1A4D",
  sky: "E0ECFB",
  blue: "4F86C6",
  sub: "E7E6E6",
  total: "D9D9D9",
  amount: "DCE8F7",
  cream: "FFF2CC",
  green: "C6EFCE",
  greenText: "006100",
  red: "FFC7CE",
  redText: "9C0006",
  ring: "C9DAF2",
  line: "BFBFBF",
  text: "1F1F1F",
};
const W = 13.333;
const TITLE_FONT = "Arial Black";
const BODY_FONT = "Calibri";
/** Content frame under the title (inches). */
const X = 0.6;
const CW = W - 2 * X;
const TOP = 2.05;
/** Bottom margin ≈ the side margins (0,55"), so no table runs to the slide's edge. */
const BOTTOM = 6.95;
/** Space between two tables on one slide. */
const GAP = 0.38;
/** Smallest table font that still reads on a projector; below it a two-table slide becomes two slides. */
const MIN_FS = 11;

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const n0 = (n: number | null | undefined) => (n == null ? "-" : Math.round(n) === 0 ? "-" : nf.format(Math.round(n)));
const nz = (n: number | null | undefined) => (n == null ? "-" : nf.format(Math.round(n)));
const neg = (n: number | null | undefined) => (n == null ? "-" : Math.round(n) === 0 ? "-" : n < 0 ? `(${nf.format(Math.round(-n))})` : nf.format(Math.round(n)));
/** Amounts in juta with one decimal ("1.140,5"), for tables too narrow for full rupiah. */
const nf1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mz = (n: number | null | undefined) => (n == null ? "-" : nf1.format(n / 1e6));
const m0 = (n: number | null | undefined) => (n == null || Math.round(n / 1e5) === 0 ? "-" : mz(n));
const mneg = (n: number | null | undefined) => (n == null || Math.round(n / 1e5) === 0 ? "-" : n < 0 ? `(${mz(-n)})` : mz(n));
const pc = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "-" : `${Math.round(n)}%`);
const pc1 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "-" : `${n.toFixed(1).replace(".", ",")}%`);
const dec = (n: number | null | undefined, d = 1) => (n == null || !Number.isFinite(n) ? "-" : n.toFixed(d));
const growth = (a: number, b: number) => (b ? (a / b - 1) * 100 : null);
const share = (a: number, t: number) => (t ? (a / t) * 100 : null);
const jt = (n: number | null | undefined) => (n == null ? "-" : `${(n / 1e6).toFixed(1).replace(".", ",")} jt`);

/** Header (dark purple), sub-header (light grey), label, number, total cells. */
const H = (t: string, o: CellOpts = {}): Cell => ({ text: t, options: { fill: { color: C.purple }, color: "FFFFFF", bold: true, align: "center", ...o } });
const G = (t: string, o: CellOpts = {}): Cell => ({ text: t, options: { fill: { color: C.sub }, color: C.text, bold: true, align: "center", ...o } });
const L = (t: string, o: CellOpts = {}): Cell => ({ text: t, options: { bold: true, align: "left", fill: { color: "FFFFFF" }, ...o } });
const N = (t: string | number, o: CellOpts = {}): Cell => ({ text: String(t), options: { align: "right", fill: { color: "FFFFFF" }, ...o } });
const T = (t: string, o: CellOpts = {}): Cell => ({ text: t, options: { align: "right", bold: true, fill: { color: C.total }, ...o } });
const TL = (t: string): Cell => T(t, { align: "left" });
const up: CellOpts = { fill: { color: C.green }, color: C.greenText };
const down: CellOpts = { fill: { color: C.red }, color: C.redText };
const upDown = (v: number | null | undefined, text: string, o: CellOpts = {}) => N(text, { ...(v == null || Math.round(v) === 0 ? {} : v > 0 ? up : down), ...o });
const has = (v: number) => N(n0(v), { ...(v ? up : down), align: "center" });

/**
 * Row height filling `space` inches with `rows` rows, capped; the font follows the row height and
 * leaves room for the line height (1.2×) + cell margins, so PowerPoint / Google Slides / Keynote
 * never have to grow a row (a grown row pushes the table off the slide).
 */
export function rowsIn(rows: number, space: number, max = 0.5) {
  const h = Math.max(0.17, Math.min(max, space / rows));
  return { rowH: h, fontSize: fontFor(h) };
}

/** Largest font (pt, half-point steps) whose single line (1.2×) + cell margins fits a row of `h` inches. */
export const fontFor = (h: number) => Math.max(7, Math.min(16, Math.floor((h - 0.04) * 50 * 2) / 2));

/** Text width in inches from per-glyph widths (em), sized for the wider fallback fonts (Arial/Liberation). */
export function textW(t: string, pt: number, bold = false): number {
  let em = 0;
  for (const ch of t) em += /[.,:;'|!il]/.test(ch) ? 0.28 : /[0-9]/.test(ch) ? 0.56 : ch === " " ? 0.28 : /[()\-]/.test(ch) ? 0.34 : /[A-Z%MW]/.test(ch) ? 0.68 : 0.56;
  return (em * (bold ? 1.06 : 1) * pt) / 72;
}

const cellText = (c: Cell) => (typeof c.text === "string" ? c.text : Array.isArray(c.text) ? c.text.map((x) => x.text ?? "").join("") : "");

/** Font size that keeps every single-column cell on one line (no wrap = no taller rows). */
export function fitFont(rows: Cell[][], colW: number[], fontSize: number, padX: number): number {
  let fs = fontSize;
  const busy: number[] = []; // rows still covered by a rowspan, per column
  for (const row of rows) {
    let ci = 0;
    for (const c of row) {
      while ((busy[ci] ?? 0) > 0) ci++;
      const span = c.options?.colspan ?? 1;
      const rs = c.options?.rowspan ?? 1;
      if (rs > 1) for (let k = 0; k < span; k++) busy[ci + k] = rs;
      const w = colW.slice(ci, ci + span).reduce((a, b) => a + b, 0) - 2 * padX - 0.02;
      const t = cellText(c);
      if (t && w > 0) {
        const need = textW(t, fs, !!c.options?.bold);
        if (need > w) fs = Math.min(fs, Math.floor((fs * w) / need * 2) / 2);
      }
      ci += span;
    }
    for (let k = 0; k < busy.length; k++) if (busy[k]) busy[k]--;
  }
  return Math.max(7, fs);
}

function table(s: Slide, rows: Cell[][], o: PptxGenJS.TableProps) {
  const margin = (o.margin as [number, number, number, number] | undefined) ?? [0.02, 0.09, 0.02, 0.09];
  // never past the bottom margin: a fixed row height shrinks when the rows would not fit
  if (typeof o.rowH === "number" && typeof o.y === "number" && o.y + o.rowH * rows.length > BOTTOM) o = { ...o, rowH: Math.max(0.17, (BOTTOM - o.y) / rows.length) };
  let fontSize = (o.fontSize as number | undefined) ?? 14;
  const colW = Array.isArray(o.colW) ? (o.colW as number[]) : null;
  if (colW) fontSize = fitFont(rows, colW, fontSize, margin[1]);
  if (typeof o.rowH === "number") fontSize = Math.min(fontSize, fontFor(o.rowH));
  s.addTable(rows, { fontFace: BODY_FONT, color: C.text, border: { type: "solid", pt: 0.5, color: C.line }, valign: "middle", autoPage: false, ...o, margin, fontSize });
}

/** Column widths: first column `first` inches, the rest share what is left of `w`. */
const cols = (n: number, w: number, first: number, last?: number) => {
  const rest = n - 1 - (last ? 1 : 0);
  const each = (w - first - (last ?? 0)) / rest;
  return [first, ...Array(rest).fill(each), ...(last ? [last] : [])];
};

/* ---------------- deck ---------------- */

export function buildDeck(Ctor: new () => Pptx, d: ReportData, m: ReportManual, logo: string | null): Pptx {
  const p = new Ctor();
  p.layout = "LAYOUT_WIDE";
  p.author = m.author || d.storeCode;
  p.company = "Digiplus";
  p.title = `${d.storeCode} ${d.title}`;
  const objects: NonNullable<PptxGenJS.SlideMasterProps["objects"]> = [
    { rect: { x: 0, y: 1.2, w: W, h: 6.3, fill: { color: C.sky } } },
    { text: { text: "›››››", options: { x: 10.55, y: 1.12, w: 1.6, h: 0.8, fontSize: 34, color: C.blue, bold: true, fontFace: "Arial", margin: 0, valign: "middle" } } },
  ];
  if (logo) objects.push({ image: { x: 9.75, y: 0.12, w: 3.2, h: 0.67, data: logo } });
  p.defineSlideMaster({ title: "CONTENT", background: { color: "FFFFFF" }, objects });

  const on = (id: SlideId) => !m.skip.includes(id);
  const vs = d.hasPrev ? `${d.curLabel} VS ${d.prevLabel}` : `${d.curLabel} ${d.year}`;
  const add = (l1: string, l2?: string) => {
    const s = p.addSlide({ masterName: "CONTENT" });
    s.addShape("ellipse", { x: 11.9, y: 0.75, w: 0.7, h: 0.7, fill: { color: C.sky }, line: { color: C.ring, width: 9 } });
    s.addText(l1, { x: X, y: 0.45, w: 9.1, h: 0.7, fontFace: TITLE_FONT, fontSize: 28, color: C.navy, bold: true, margin: 0, valign: "bottom", fit: "shrink" });
    if (l2) s.addText(l2, { x: X, y: 1.25, w: 9.8, h: 0.6, fontFace: TITLE_FONT, fontSize: 18, color: C.navy, bold: true, margin: 0, valign: "middle", fit: "shrink" });
    return s;
  };

  if (on("cover")) cover(p, d, m, logo);
  if (on("target")) slideTarget(add(`Target & Achievement${d.hasPrev ? " MTM" : ""}${d.hasLy ? `${d.hasPrev ? " -" : ""} LFL` : ""}`, vs), d);
  const more = (l1: string, l2?: string) => () => add(l1, l2 ? `${l2} (lanjutan)` : "(lanjutan)");
  if (on("staff")) slideStaff(add("Target & Achievement per Staff", vs), d, more("Target & Achievement per Staff", vs));
  if (on("balance")) slideBalance(add("Brand Balance & Contribution", d.curLabel), d, more("Brand Balance & Contribution", d.curLabel));
  if (on("android")) slideSplit(add("Breakdown Staff Performance", `Android ${d.curLabel}`), d, "android", more("Breakdown Staff Performance", `Android ${d.curLabel}`));
  if (on("apple")) slideSplit(add("Breakdown Staff Performance", `Apple ${d.curLabel}`), d, "apple", more("Breakdown Staff Performance", `Apple ${d.curLabel}`));
  if (on("accvas")) slideAccVas(add("Breakdown Acc & VAS", vs), d, more("Breakdown Acc & VAS", vs));
  if (on("productivity")) slideProductivity(add("Compare Productivity", vs), d, m);
  if (on("weekly")) slideWeekly(add("Weekly Performance", `${d.monthName} ${d.year} (W1${d.weeks.length > 1 ? ` - W${d.weeks.length}` : ""})`), d);
  if (on("npi")) slideNpi(add(m.npi.title1 || "NPI", m.npi.title2 || undefined), m);
  if (on("bnpl")) slideBnpl(add("Kontribusi BNPL", `(Buy Now Pay Later) ${d.monthName} ${d.year}`), d, m);
  if (on("ytd")) slideYtd(add("YTD Performance", `Jan - ${d.ytd[d.ytd.length - 1]?.label ?? ""} ${d.ytdYears[1]} VS ${d.ytdYears[0]}`), d);
  if (on("lob")) slideLob(add("Breakdown LOB Per Brand", vs), d);
  if (on("stock") && d.stockOut) {
    const so = d.stockOut;
    const f = m.stock ?? STOCK_FILTER;
    const dm = (x: string) => `${x.slice(8, 10)}/${x.slice(5, 7)}`;
    const t1 = f.minDays === 7 ? "Stock Kosong ≥ 1 Minggu" : f.minDays % 7 === 0 ? `Stock Kosong ≥ ${f.minDays / 7} Minggu` : `Stock Kosong ≥ ${f.minDays} Hari`;
    const l2 = `SOH ${dm(so.sohDate)} · laku ${dm(so.from)}–${dm(so.to)}${f.minSold > 1 ? ` (min. ${f.minSold} unit)` : ""}, tidak terjual ≥ ${f.minDays} hari`;
    slideStock(add(t1, l2), stockRows(d, f), f, more(t1, l2));
  }
  if (on("issue")) slideIssue(add(`Issue & Feedback ${d.mode === "closing" ? d.monthName : `W${d.weekIndex} ${d.monthName}`}`), d, m);
  if (on("thanks")) thanks(p);
  return p;
}

function cover(p: Pptx, d: ReportData, m: ReportManual, logo: string | null) {
  const s = p.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape("ellipse", { x: 0.8, y: -1.6, w: 2.8, h: 2.8, fill: { color: "FFFFFF" }, line: { color: C.sky, width: 34 } });
  s.addShape("ellipse", { x: 11.1, y: 1.95, w: 1.65, h: 1.65, fill: { color: "FFFFFF" }, line: { color: C.sky, width: 26 } });
  s.addShape("ellipse", { x: 10.1, y: 2.4, w: 0.65, h: 0.65, fill: { color: "FFFFFF" }, line: { color: C.ring, width: 10 } });
  s.addShape("ellipse", { x: 5.6, y: 6.05, w: 3, h: 3, fill: { color: "FFFFFF" }, line: { color: C.sky, width: 34 } });
  s.addShape("roundRect", { x: -0.3, y: 2.4, w: 1.35, h: 3.35, fill: { color: "5389CA" }, rectRadius: 0.25 });
  if (logo) s.addImage({ data: logo, x: 9.75, y: 0.12, w: 3.2, h: 0.67 });
  const code = d.storeCode ? d.storeCode.replace(/^([A-Z]+)(\d+)$/, "$1 - $2") : "";
  const name = (d.storeName || "").toUpperCase();
  s.addText([code, ...wrap(name, 16)].filter(Boolean).join("\n"), { x: 1.1, y: 1.0, w: 8.4, h: 3.1, fontFace: TITLE_FONT, fontSize: 48, color: C.navy, bold: true, margin: 0, lineSpacingMultiple: 0.9, valign: "middle", fit: "shrink" });
  s.addText(d.title.toUpperCase(), { x: 1.2, y: 4.45, w: 9, h: 0.65, fontFace: TITLE_FONT, fontSize: 28, color: C.navy, margin: 0, fit: "shrink" });
  if (m.author) s.addText(m.author, { x: 1.15, y: 5.25, w: 9, h: 0.4, fontFace: "Arial", fontSize: 18, bold: true, color: "111111", margin: 0 });
  s.addText("›››››", { x: 1.7, y: 6.0, w: 1.7, h: 0.8, fontSize: 34, color: C.blue, bold: true, margin: 0, valign: "middle" });
}

/** Breaks "DIGIPLUS KOTA KASABLANKA" into lines of about `n` characters. */
function wrap(text: string, n: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + w).length > n) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

function slideTarget(s: Slide, d: ReportData) {
  const cream: CellOpts = { fill: { color: C.cream } };
  const rows = d.groups.map((g) => {
    const hi = g.group === "Amount";
    const f: CellOpts = hi ? { fill: { color: C.amount }, bold: true } : {};
    const c: CellOpts = { ...cream, bold: hi };
    return [L(g.group, f), N(nz(g.target), { bold: true, ...f }), N(nz(g.mtd), f), N(pc(g.achPct), c), ...(d.hasPrev ? [N(g.mtm == null ? "-" : nz(g.mtm), f), N(pc(g.mtmGrowth), c)] : []), ...(d.hasLy ? [N(g.lfl == null ? "-" : nz(g.lfl), f), N(pc(g.lflGrowth), c)] : [])];
  });
  const head1 = [H(String(d.day)), H(""), H("Ideal"), H(pc(d.timeGonePct)), ...(d.hasPrev ? [H(""), H("")] : []), ...(d.hasLy ? [H(""), H("")] : [])];
  const head2 = [G(`${d.monthName} ${d.year}`, { align: "left" }), G("Target"), G("MTD"), G("%"), ...(d.hasPrev ? [G(`MTM (${d.prevShort})`), G("Growth")] : []), ...(d.hasLy ? [G(`LFL (${d.lyShort})`), G("Growth")] : [])];
  const n = head1.length;
  // money columns wide, % columns narrow
  const colW = head2.map((_, i) => (i === 0 ? 1.75 : [3, 5, 7].includes(i) ? 1.05 : 1.95));
  const w = colW.reduce((a, b) => a + b, 0);
  const scale = Math.min(1, CW / w);
  table(s, [head1, head2, ...rows], { x: X + (CW - w * scale) / 2, y: TOP + 0.35, w: w * scale, colW: colW.map((c) => c * scale), rowH: 0.62, fontSize: n > 6 ? 15 : 16 });
}

const staffOnly = (d: ReportData) => d.staff.filter((r) => r.kind === "staff");

function slideStaff(s: Slide, d: ReportData, more: () => Slide) {
  const st = staffOnly(d);
  const extra = d.staff.filter((r) => r.kind !== "staff");
  const tRows = st.length + 3;
  const aRows = st.length + extra.length + 3;
  const one = rowsIn(tRows + aRows, BOTTOM - TOP - GAP, 0.36);
  // too many staff for both tables at a readable size: Achievement goes on its own slide
  const split = one.fontSize < MIN_FS;
  const { rowH, fontSize } = split ? rowsIn(Math.max(tRows, aRows), BOTTOM - TOP, 0.42) : one;
  const fs = Math.min(fontSize, split ? 14 : 12);
  const sum = (k: "Apple" | "Android" | "ACC" | "VAS") => st.reduce((a, r) => a + r.target[k], 0);
  const tTot = st.reduce((a, r) => a + r.targetTotal, 0);
  const tw = 8.6;
  table(
    s,
    [
      [H(""), H("Target", { colspan: 5 })],
      [G(""), G("Apple"), G("Android"), G("Accesories"), G("VAS"), G("Total", { fill: { color: C.amount } })],
      ...st.map((r) => [L(r.name), N(nz(r.target.Apple)), N(nz(r.target.Android)), N(nz(r.target.ACC)), N(nz(r.target.VAS)), N(nz(r.targetTotal), { bold: true })]),
      [TL("Total"), T(nz(sum("Apple"))), T(nz(sum("Android"))), T(nz(sum("ACC"))), T(nz(sum("VAS"))), T(nz(tTot), { fill: { color: C.amount } })],
    ],
    { x: X + (CW - tw) / 2, y: TOP, w: tw, rowH, fontSize: fs, colW: cols(6, tw, 1.5) },
  );
  const s2 = split ? more() : s;
  const yA = split ? TOP : TOP + rowH * tRows + GAP;
  const tb = d.storeTotals;
  const aColW = [1.45, ...Array(9).fill((CW - 2.15) / 9), 0.7];
  const aMargin: [number, number, number, number] = [0.02, 0.05, 0.02, 0.05];
  const aFs = split ? fs : Math.min(fs, 12);
  const achRows = (f0: typeof n0, fz: typeof nz, fneg: typeof neg, head: string): Cell[][] => {
    const v = (r: StaffRowData, g: "Apple" | "Android" | "ACC" | "VAS") => (r.kind === "staff" ? upDown(r.actual[g] - r.target[g], fneg(r.actual[g] - r.target[g])) : N("-"));
    return [
      [H(""), H(head, { colspan: 10 })],
      [G(""), G("Apple"), G("Var"), G("Android"), G("Var"), G("Accesories"), G("Var"), G("VAS"), G("Var"), G("Total"), G("%")],
      ...[...st, ...extra].map((r) => [L(r.name), N(f0(r.actual.Apple)), v(r, "Apple"), N(f0(r.actual.Android)), v(r, "Android"), N(f0(r.actual.ACC)), v(r, "ACC"), N(f0(r.actual.VAS)), v(r, "VAS"), N(f0(r.total), { bold: true }), N(r.kind === "staff" ? pc(r.achPct) : "-", { bold: true })]),
      [TL("Total"), T(fz(tb.actual.Apple)), T(fneg(tb.actual.Apple - tb.targetByGroup.Apple)), T(fz(tb.actual.Android)), T(fneg(tb.actual.Android - tb.targetByGroup.Android)), T(fz(tb.actual.ACC)), T(fneg(tb.actual.ACC - tb.targetByGroup.ACC)), T(fz(tb.actual.VAS)), T(fneg(tb.actual.VAS - tb.targetByGroup.VAS)), T(fz(tb.total)), T(pc(share(tb.total, tb.target)))],
    ];
  };
  // 11 columns of full rupiah (e.g. "(2.863.582.357)") only fit at ~8pt: then the table shows juta (1 decimal) instead
  const full = achRows(n0, nz, neg, "Achievement");
  const rows = fitFont(full, aColW, aFs, aMargin[1]) >= MIN_FS ? full : achRows(m0, mz, mneg, "Achievement (juta Rp)");
  table(s2, rows, { x: X, y: yA, w: CW, rowH, fontSize: aFs, margin: aMargin, colW: aColW });
}

function slideBalance(s: Slide, d: ReportData, more: () => Slide) {
  const b = d.balance;
  const bw = 7.2;
  table(
    s,
    [
      [H("Brand balance by Value", { colspan: 2 }), H("Brand balance by QTY", { colspan: 2 })],
      [G("Apple"), G("Android"), G("Apple"), G("Android")],
      [N(pc(b.value?.[0]), { align: "center", bold: true }), N(pc(b.value?.[1]), { align: "center", bold: true }), N(pc(b.qty?.[0]), { align: "center", bold: true }), N(pc(b.qty?.[1]), { align: "center", bold: true })],
    ],
    { x: X + (CW - bw) / 2, y: TOP, w: bw, rowH: 0.42, fontSize: 15 },
  );
  const rows = d.staff;
  const y0 = TOP + 0.42 * 3 + GAP;
  const fits = rowsIn(rows.length + 2, BOTTOM - y0, 0.42).fontSize >= MIN_FS;
  // many staff: the contribution table gets its own slide
  const y = fits ? y0 : TOP;
  const { rowH, fontSize } = rowsIn(rows.length + 2, BOTTOM - y, 0.42);
  const t = d.storeTotals;
  table(
    fits ? s : more(),
    [
      [H("Contribution", { align: "left" }), H("Achievement"), H("Contribution"), H("Invoice"), H("ATV"), H("UPT")],
      ...rows.map((r) => [L(r.name), N(nz(r.total)), N(pc(share(r.total, t.total))), N(nz(r.invoices)), N(nz(r.atv)), N(dec(r.upt))]),
      [TL("Total"), T(nz(t.total)), T("100%"), T(nz(t.invoices)), T(nz(t.atv)), T(dec(t.upt))],
    ],
    { x: X, y, w: CW, rowH, fontSize, colW: cols(6, CW, 2.2) },
  );
}

function slideSplit(s: Slide, d: ReportData, kind: "android" | "apple", more: () => Slide) {
  const keys = kind === "android" ? d.androidBrands : d.appleLobs;
  const label = (c: string) => (kind === "apple" ? ({ "Apple Watch": "Apple watch", Mac: "Macbook" } as Record<string, string>)[c] ?? c : c);
  const rows = d.staff;
  const get = (r: StaffRowData, c: string) => (kind === "android" ? r.android[c] : r.apple[c]) ?? { qty: 0, value: 0 };
  const sumQ = (c: string) => rows.reduce((a, r) => a + get(r, c).qty, 0);
  const sumV = (c: string) => rows.reduce((a, r) => a + get(r, c).value, 0);
  const tq = keys.reduce((a, c) => a + sumQ(c), 0);
  const tv = keys.reduce((a, c) => a + sumV(c), 0);
  const nRows = rows.length + 3;
  const one = rowsIn(nRows * 2, BOTTOM - TOP - GAP, 0.36);
  // too many staff for qty + value at a readable size: value goes on its own slide
  const split = one.fontSize < MIN_FS;
  const { rowH, fontSize } = split ? rowsIn(nRows, BOTTOM - TOP, 0.48) : one;
  const colW = cols(keys.length + 2, CW, 1.6, 1.7);
  const cont = (vals: Array<number | null>) => [G("Contribution", { align: "left" }), ...vals.map((v) => G(pc(v), { bold: false })), G("")];
  const head = [H("Detail", { align: "left" }), ...keys.map((c) => H(label(c))), H("Total")];
  table(
    s,
    [
      cont(keys.map((c) => share(sumQ(c), tq))),
      head,
      ...rows.map((r) => [L(r.name), ...keys.map((c) => has(get(r, c).qty)), N(n0(keys.reduce((a, c) => a + get(r, c).qty, 0)), { bold: true })]),
      [TL("Total"), ...keys.map((c) => T(nz(sumQ(c)), { align: "center" })), T(nz(tq))],
    ],
    { x: X, y: TOP, w: CW, rowH, fontSize, colW },
  );
  table(
    split ? more() : s,
    [
      cont(keys.map((c) => share(sumV(c), tv))),
      head,
      ...rows.map((r) => [L(r.name), ...keys.map((c) => N(n0(get(r, c).value))), N(n0(keys.reduce((a, c) => a + get(r, c).value, 0)), { bold: true })]),
      [TL("Total"), ...keys.map((c) => T(nz(sumV(c)))), T(nz(tv))],
    ],
    { x: X, y: split ? TOP : TOP + rowH * nRows + GAP, w: CW, rowH, fontSize, colW },
  );
}

function slideAccVas(s: Slide, d: ReportData, more: () => Slide) {
  const rows = d.accVas;
  const vRows = rows.filter((r) => r.name !== "Lainnya*" || r.vasTotal || r.qoalaPrev);
  const one = rowsIn(rows.length + vRows.length + 4, BOTTOM - TOP - GAP, 0.4);
  const split = one.fontSize < MIN_FS;
  const { rowH, fontSize } = split ? rowsIn(Math.max(rows.length, vRows.length) + 2, BOTTOM - TOP, 0.42) : one;
  const tot = rows.reduce(
    (a, r) => {
      for (const k of Object.keys(a) as Array<keyof AccVasRow>) if (k !== "name") (a as unknown as Record<string, number>)[k] += r[k] as number;
      return a;
    },
    { name: "Total", accEx: 0, accExPrev: 0, airpods: 0, airpodsPrev: 0, qoala: 0, qoalaPrev: 0, telkomsel: 0, xl: 0, indosat: 0, vasTotal: 0 } as AccVasRow,
  );
  const diff = (a: number, b: number) => (d.hasPrev ? upDown(a - b, neg(a - b), { bold: true }) : N("-"));
  table(
    s,
    [
      [H("ACC", { align: "left" }), H("Acc Exc Airpods"), H("MTM"), H("Difference"), H("Airpods"), H("MTM"), H("Difference")],
      ...rows.map((r) => [L(r.name), N(n0(r.accEx)), N(n0(r.accExPrev)), diff(r.accEx, r.accExPrev), N(n0(r.airpods)), N(n0(r.airpodsPrev)), diff(r.airpods, r.airpodsPrev)]),
      [TL("Total"), T(n0(tot.accEx)), T(n0(tot.accExPrev)), T(neg(tot.accEx - tot.accExPrev)), T(n0(tot.airpods)), T(n0(tot.airpodsPrev)), T(neg(tot.airpods - tot.airpodsPrev))],
    ],
    { x: X, y: TOP, w: CW, rowH, fontSize, colW: cols(7, CW, 1.6) },
  );
  table(
    split ? more() : s,
    [
      [H("VAS", { align: "left" }), H("Qoala"), H("MTM"), H("Difference"), H("%"), H("Telkomsel"), H("XL"), H("Indosat"), H("Total")],
      ...vRows.map((r) => [L(r.name), N(n0(r.qoala)), N(n0(r.qoalaPrev)), diff(r.qoala, r.qoalaPrev), d.hasPrev ? upDown(r.qoala - r.qoalaPrev, pc(growth(r.qoala, r.qoalaPrev)), { bold: true }) : N("-"), N(n0(r.telkomsel)), N(n0(r.xl)), N(n0(r.indosat)), N(n0(r.vasTotal), { bold: true })]),
      [TL("Total"), T(n0(tot.qoala)), T(n0(tot.qoalaPrev)), T(neg(tot.qoala - tot.qoalaPrev)), T(pc(growth(tot.qoala, tot.qoalaPrev))), T(n0(tot.telkomsel)), T(n0(tot.xl)), T(n0(tot.indosat)), T(n0(tot.vasTotal))],
    ],
    { x: X, y: split ? TOP : TOP + rowH * (rows.length + 2) + GAP, w: CW, rowH, fontSize, colW: [1.6, 1.4, 1.4, 1.4, 0.85, 1.4, 1.25, 1.25, 1.58] },
  );
}

function slideProductivity(s: Slide, d: ReportData, m: ReportManual) {
  const c = d.productivity.cur;
  const p = d.productivity.prev;
  const traffic = (auto: number | null, typed: number | null) => (typed && typed > 0 ? typed : auto);
  const tc = traffic(c.traffic, m.traffic.cur);
  const tp = p ? traffic(p.traffic, m.traffic.prev) : null;
  // typed traffic → CVR from that traffic and the whole period's invoices
  const cvr = (side: typeof c, t: number | null, typed: number | null) => (typed && typed > 0 ? (side.invoices / typed) * 100 : t ? side.cvr : null);
  const bal = (b: [number, number] | null) => (b ? `${Math.round(b[0])} : ${Math.round(b[1])}` : "-");
  const ch = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? growth(a, b) : null);
  const rows: Array<[string, string, string, number | null]> = [
    ["Amount", nz(c.amount), p ? nz(p.amount) : "-", ch(c.amount, p?.amount)],
    ["D Sales Avg", nz(c.dailyAvg), p ? nz(p.dailyAvg) : "-", ch(c.dailyAvg, p?.dailyAvg)],
    ["Brand Balance", bal(c.balance), p ? bal(p.balance) : "-", null],
    ["Invoice", nz(c.invoices), p ? nz(p.invoices) : "-", ch(c.invoices, p?.invoices)],
    ["Traffic", tc ? nz(tc) : "-", tp ? nz(tp) : "-", ch(tc, tp)],
    ["UPT", dec(c.upt), p ? dec(p.upt) : "-", ch(c.upt, p?.upt)],
    ["CVR", pc1(cvr(c, tc, m.traffic.cur)), p ? pc1(cvr(p, tp, m.traffic.prev)) : "-", null],
    ["ATV", nz(c.atv), p ? nz(p.atv) : "-", ch(c.atv, p?.atv)],
  ];
  const withGrowth = !!p;
  const w = withGrowth ? 8.2 : 6.2;
  table(
    s,
    [
      [H(d.storeCode || "Toko", { align: "left" }), H(d.mode === "closing" ? "This Month" : d.curLabel), H(d.mode === "closing" ? "Last Month" : d.prevLabel), ...(withGrowth ? [H("Growth")] : [])],
      ...rows.map(([k, a, b, g]) => [L(k), N(a), N(b), ...(withGrowth ? [g == null ? N("-", { align: "center" }) : upDown(g, `${g >= 0 ? "+" : ""}${Math.round(g)}%`, { align: "center", bold: true })] : [])]),
    ],
    { x: X + (CW - w) / 2, y: TOP + 0.1, w, rowH: 0.54, fontSize: 16, colW: withGrowth ? [2.2, 2.3, 2.3, 1.4] : [2.0, 2.1, 2.1] },
  );
}

function slideWeekly(s: Slide, d: ReportData) {
  const w = d.weeks;
  const t = d.weeksTotal;
  const head = [H(d.storeCode || "Toko", { align: "left" }), ...w.map((x) => H(x.label)), H(d.mode === "closing" ? `Total ${d.monthName.slice(0, 3)}` : "MTD")];
  const r = (label: string, vals: Cell[], tot: string) => [L(label), ...vals, T(tot)];
  const cell = (v: string) => N(v);
  table(
    s,
    [
      head,
      r("Periode", w.map((x) => G(x.period, { bold: false })), t.period),
      r("Sales", w.map((x) => cell(nz(x.sales))), nz(t.sales)),
      r("Target", w.map((x) => cell(nz(x.target))), nz(t.target)),
      r("Achievement", w.map((x) => N(pc(x.achPct), { bold: true, color: (x.achPct ?? 0) >= 100 ? C.greenText : C.redText })), pc(t.achPct)),
      r("Transaksi", w.map((x) => cell(nz(x.trx))), nz(t.trx)),
      r("UPT", w.map((x) => cell(dec(x.upt, 2))), dec(t.upt, 2)),
      r("ATV", w.map((x) => cell(jt(x.atv))), jt(t.atv)),
      r("vs Week Lalu", w.map((x) => (x.vsPrev == null ? N("-") : upDown(x.vsPrev, `${x.vsPrev >= 0 ? "+" : ""}${Math.round(x.vsPrev)}%`))), t.mtmGrowth == null ? "-" : `${t.mtmGrowth >= 0 ? "+" : ""}${Math.round(t.mtmGrowth)}% MTM`),
    ],
    { x: X, y: TOP + 0.2, w: CW, rowH: 0.54, fontSize: w.length > 5 ? 14 : 16, colW: cols(w.length + 2, CW, 1.9) },
  );
}

function slideNpi(s: Slide, m: ReportManual) {
  const n = m.npi;
  const v = (x: number | null) => x ?? 0;
  const ta = n.rows.reduce((a, r) => a + v(r.a), 0);
  const tb = n.rows.reduce((a, r) => a + v(r.b), 0);
  const duo = n.duo.filter((r) => r.label.trim());
  const td = duo.reduce((a, r) => a + v(r.unit), 0);
  const two = !!(n.duoTitle.trim() || td);
  const lw = two ? 6.6 : 8;
  table(
    s,
    [
      [H(n.period ? `NPI (${n.period})` : "NPI", { align: "left" }), H(n.colA || "-"), H(n.colB || "-"), H("TOTAL")],
      ...n.rows.filter((r) => r.label.trim()).map((r) => [L(r.label), N(nz(v(r.a))), N(nz(v(r.b))), N(nz(v(r.a) + v(r.b)), { bold: true })]),
      [H("TOTAL"), H(nz(ta)), H(nz(tb)), H(nz(ta + tb))],
    ],
    { x: two ? X : X + (CW - lw) / 2, y: TOP + 0.2, w: lw, rowH: 0.56, fontSize: 16, colW: cols(4, lw, 2.4) },
  );
  if (two) {
    const pct = (x: number) => pc(share(x, td));
    table(
      s,
      [
        [H(n.duoTitle || "NPI", { align: "left" }), H("Unit"), H("%")],
        ...duo.map((r) => [L(r.label), N(nz(v(r.unit))), N(pct(v(r.unit)))]),
        [H("TOTAL"), H(nz(td)), H("100%")],
        ...(n.pickup != null ? [[L("Sudah Pickup"), N(nz(n.pickup)), N(pct(n.pickup))]] : []),
        ...(n.unboxing != null ? [[L(n.unboxingLabel || "Unboxing"), N(nz(n.unboxing)), N(pct(n.unboxing))], [L("Tidak Unboxing"), N(nz(td - n.unboxing)), N(pct(td - n.unboxing))]] : []),
      ],
      { x: X + lw + 0.33, y: TOP + 0.2, w: CW - lw - 0.33, rowH: 0.56, fontSize: 16, colW: cols(3, CW - lw - 0.33, 2.4) },
    );
  }
}

/** BNPL rows: the BNPL menu, or what was typed in the pop-up when a provider has no data there. */
export function bnplRows(d: ReportData, m: ReportManual) {
  const rows = d.bnpl.rows.map((r) => {
    const x = m.bnpl.per[r.provider];
    return { ...r, value: x?.value ?? r.value, qty: x?.qty ?? r.qty };
  });
  return { rows, value: rows.reduce((a, r) => a + r.value, 0), qty: rows.reduce((a, r) => a + r.qty, 0) };
}

function slideBnpl(s: Slide, d: ReportData, m: ReportManual) {
  const b = bnplRows(d, m);
  const per = (p: string) => m.bnpl.per[p] ?? { a: null, b: null };
  const withModels = b.rows.some((r) => per(r.provider).a || per(r.provider).b);
  const rows = b.rows.filter((r) => r.value || r.qty);
  const ta = rows.reduce((a, r) => a + (per(r.provider).a ?? 0), 0);
  const tb = rows.reduce((a, r) => a + (per(r.provider).b ?? 0), 0);
  const mc = (x: number | null) => N(x ? nz(x) : "-", { align: "center" });
  const w = withModels ? CW : 9.2;
  table(
    s,
    [
      [H("BNPL", { align: "left" }), H("Total Value"), H("Kontribusi"), H("Kontrak"), H("Avg / Kontrak"), ...(withModels ? [H(m.bnpl.colA || "-"), H(m.bnpl.colB || "-"), H("Total")] : [])],
      ...rows.map((r) => [L(r.label), N(nz(r.value)), N(pc1(share(r.value, b.value))), N(nz(r.qty), { align: "center" }), N(r.qty ? nz(r.value / r.qty) : "-"), ...(withModels ? [mc(per(r.provider).a), mc(per(r.provider).b), mc((per(r.provider).a ?? 0) + (per(r.provider).b ?? 0))] : [])]),
      [H("TOTAL"), H(nz(b.value), { align: "right" }), H("100%", { align: "right" }), H(nz(b.qty)), H(b.qty ? nz(b.value / b.qty) : "-", { align: "right" }), ...(withModels ? [H(nz(ta)), H(nz(tb)), H(nz(ta + tb))] : [])],
    ],
    { x: X + (CW - w) / 2, y: TOP + 0.1, w, rowH: 0.52, fontSize: 15, colW: withModels ? [2.3, 1.85, 1.4, 1.1, 1.75, 1.25, 1.25, 1.23] : [2.3, 2.0, 1.5, 1.4, 2.0] },
  );
  const sorted = [...rows].sort((x, y) => y.value - x.value);
  const sales = d.storeTotals.total;
  const parts = [`BNPL ${d.mode === "closing" ? d.monthName : d.curLabel} ${rpShort(b.value)} dari ${b.qty} kontrak = ${pc1(share(b.value, sales))} dari total sales (${rpShort(sales)}), avg ${rpShort(b.qty ? b.value / b.qty : 0)}/kontrak.`];
  if (sorted.length >= 2) parts.push(`${sorted[0].label} (${pc1(share(sorted[0].value, b.value))}) & ${sorted[1].label} (${pc1(share(sorted[1].value, b.value))}) menyumbang ${pc1(share(sorted[0].value + sorted[1].value, b.value))} value BNPL.`);
  if (withModels) parts.push(`Total ${ta + tb} unit ${[m.bnpl.colA, m.bnpl.colB].filter(Boolean).join(" & ")} via BNPL.`);
  // summary sits under the table (same as the store's deck)
  const yText = TOP + 0.1 + 0.52 * (rows.length + 2) + 0.45;
  if (b.value) s.addText(parts.join(" "), { x: X + (CW - w) / 2, y: Math.min(yText, BOTTOM - 0.8), w, h: 0.8, fontSize: 15, bold: true, color: C.navy, fontFace: BODY_FONT, margin: 0, valign: "top", fit: "shrink" });
}

function slideYtd(s: Slide, d: ReportData) {
  const [py, cy] = d.ytdYears;
  const rows = d.ytd;
  const both = rows.filter((r) => r.prev && r.cur);
  const tp = both.reduce((a, r) => ({ qty: a.qty + r.prev!.qty, value: a.value + r.prev!.value }), { qty: 0, value: 0 });
  const tc = both.reduce((a, r) => ({ qty: a.qty + r.cur!.qty, value: a.value + r.cur!.value }), { qty: 0, value: 0 });
  const { rowH, fontSize } = rowsIn(rows.length + 2, BOTTOM - TOP - 0.1, 0.46);
  const cr: CellOpts = { fill: { color: C.cream } };
  table(
    s,
    [
      [H("Bulan", { align: "left" }), H(`Qty ${py}`), H(`Value ${py}`), H(`Qty ${cy}`), H(`Value ${cy}`), H("Selisih Value"), H("Growth")],
      ...rows.map((r) => [L(r.upTo ? `${r.label} (1-${r.upTo})` : r.label), N(r.prev ? nz(r.prev.qty) : "-"), N(r.prev ? nz(r.prev.value) : "-"), N(r.cur ? nz(r.cur.qty) : "-", cr), N(r.cur ? nz(r.cur.value) : "-", cr), N(r.prev && r.cur ? neg(r.cur.value - r.prev.value) : "-"), r.prev && r.cur ? upDown(r.cur.value - r.prev.value, pc(growth(r.cur.value, r.prev.value)), { bold: true }) : N("-")]),
      [TL("Total YTD"), T(nz(tp.qty)), T(nz(tp.value)), T(nz(tc.qty)), T(nz(tc.value)), T(neg(tc.value - tp.value)), T(pc(growth(tc.value, tp.value)))],
    ],
    { x: X, y: TOP + 0.05, w: CW, rowH, fontSize, colW: [1.7, 1.3, 2.05, 1.3, 2.05, 2.05, 1.68] },
  );
}

function slideLob(s: Slide, d: ReportData) {
  const rows = d.lob;
  const { rowH, fontSize } = rowsIn(rows.length + 2, BOTTOM - TOP, 0.42);
  const cell = (cur: number, prev: number, total: boolean) => {
    const o: CellOpts = total ? { fill: { color: C.total }, bold: true } : {};
    const g = growth(cur, prev);
    const pctText = !prev ? (cur ? "new" : "-") : pc(g);
    if (!d.hasPrev) return [N(n0(cur), o), N("-", o), N("-", o), N("-", o)];
    return [N(n0(cur), o), N(n0(prev), o), N(neg(cur - prev), { bold: true, ...o }), total ? N(pctText, o) : upDown(cur - prev, pctText, { bold: true })];
  };
  table(
    s,
    [
      [H(d.storeCode || "Toko", { rowspan: 2 }), H("By Quantity", { colspan: 4 }), H("By Value", { colspan: 4 })],
      [H("MTD"), H("MTM"), H("Difference"), H("%"), H("MTD"), H("MTM"), H("Difference"), H("%")],
      ...rows.map((r) => {
        const total = r.kind === "totalApple" || r.kind === "totalAndroid";
        return [total ? TL(r.label) : L(r.label), ...cell(r.cur.qty, r.prev.qty, total), ...cell(r.cur.value, r.prev.value, total)];
      }),
    ],
    { x: X, y: TOP - 0.05, w: CW, rowH, fontSize: Math.min(fontSize, 15), colW: [1.7, 0.9, 0.9, 1.25, 0.85, 1.7, 1.7, 1.75, 1.38] },
  );
}

/** Stock-kosong groups after the pop-up filter; `total` = articles before the per-brand cut. */
export function stockRows(d: ReportData, f: StockFilter) {
  const hide = new Set(f.hide);
  return (d.stockOut?.groups ?? [])
    .filter((g) => !hide.has(g.category))
    .map((g) => {
      const all = g.items.filter((it) => it.days >= f.minDays && it.sold >= f.minSold);
      return { category: g.category, total: all.length, items: f.perBrand > 0 ? all.slice(0, f.perBrand) : all };
    })
    .filter((g) => g.items.length);
}

/** Number of slides the stock table takes (about: same rows per slide as the slide). */
export function stockSlides(groups: ReturnType<typeof stockRows>): number {
  const n = groups.reduce((a, g) => a + g.items.length + 1, 0);
  return n ? Math.ceil(n / STOCK_ROWS) : 1;
}

/** Body rows per stock slide (brand rows included): keeps the font ≥ 12pt. */
const STOCK_ROWS = 15;

function slideStock(s: Slide, groups: ReturnType<typeof stockRows>, f: StockFilter, more: () => Slide) {
  const so = { groups };
  const total = so.groups.reduce((a, g) => a + g.items.length, 0);
  if (!total) {
    s.addText(`Tidak ada device yang stoknya kosong ≥ ${f.minDays} hari dari yang laku 30 hari terakhir.`, { x: X, y: TOP + 0.6, w: CW, h: 1, fontFace: BODY_FONT, fontSize: 20, color: C.navy, bold: true, align: "center", valign: "middle", margin: 0 });
    return;
  }
  const dm = (x: string) => `${x.slice(8, 10)}/${x.slice(5, 7)}`;
  const colW = [4.85, 1.4, 1.0, 1.25, 1.0, CW - 9.5];
  const totalOf = new Map(groups.map((g) => [g.category, g.total]));
  const brand = (c: string, n: number, cont = false): Cell[] => {
    const t = totalOf.get(c) ?? n;
    return [G(`${c}${cont ? " (lanjutan)" : ""}`, { align: "left" }), G(t > n ? `top ${n} dari ${t} artikel` : `${n} artikel`, { colspan: 5, align: "left", bold: false })];
  };
  // as many colours as fit the column, then "+n"
  const alt = (a: Array<{ color: string; qty: number }>) => {
    if (!a.length) return "-";
    for (let k = a.length; k > 1; k--) {
      const t = a.slice(0, k).map((x) => `${x.color} (${x.qty})`).join(", ") + (k < a.length ? ` +${a.length - k}` : "");
      if (textW(t, 13) <= colW[5] - 0.2) return t;
    }
    return `${a[0].color} (${a[0].qty})${a.length > 1 ? ` +${a.length - 1}` : ""}`;
  };
  // flat body rows, then cut into slides; a slide starting mid-brand repeats the brand row
  const body: Array<{ brand: string; n: number; row?: Cell[] }> = [];
  for (const g of so.groups) {
    body.push({ brand: g.category, n: g.items.length });
    for (const it of g.items)
      body.push({
        brand: g.category,
        n: g.items.length,
        row: [L(it.description || it.article, { bold: false }), N(it.article, { align: "center" }), N(nz(it.sold), { align: "center" }), N(dm(it.lastSold), { align: "center" }), N(`${it.days} hari`, { align: "center", ...(it.days >= 14 ? down : { color: C.redText }), bold: true }), N(alt(it.alt), { align: "left", color: it.alt.length ? C.greenText : C.text })],
      });
  }
  // even pages (no single-row tail slide); a slide never ends on a bare brand row
  const per = Math.ceil(body.length / Math.ceil(body.length / STOCK_ROWS));
  const pages: Cell[][][] = [];
  let cur: Cell[][] = [];
  for (const b of body) {
    if (cur.length >= per || (!b.row && cur.length >= per - 1)) {
      pages.push(cur);
      cur = [];
    }
    if (!cur.length && b.row) cur.push(brand(b.brand, b.n, true));
    cur.push(b.row ?? brand(b.brand, b.n));
  }
  if (cur.length) pages.push(cur);
  const head = [H("Device", { align: "left" }), H("Artikel"), H("Sold 30 hr"), H("Terakhir laku"), H("Kosong"), H("Warna lain ready", { align: "left" })];
  const most = Math.max(...pages.map((p) => p.length));
  const { rowH, fontSize } = rowsIn(most + 1, BOTTOM - TOP, 0.4);
  // long names are cut (…) rather than shrinking the whole table
  const fs = Math.max(MIN_FS + 1, Math.min(fontSize, 13));
  for (const rows of pages)
    for (const r of rows)
      if (r.length === 6)
        [0, 5].forEach((ci) => {
          const w = colW[ci] - 0.2;
          let t = String(r[ci].text);
          if (textW(t, fs, !!r[ci].options?.bold) <= w) return;
          while (t.length > 1 && textW(t + "…", fs, !!r[ci].options?.bold) > w) t = t.slice(0, -1);
          r[ci] = { ...r[ci], text: t.trimEnd() + "…" };
        });
  pages.forEach((rows, i) => table(i ? more() : s, [head, ...rows], { x: X, y: TOP, w: CW, rowH, fontSize: fs, colW }));
}

function slideIssue(s: Slide, d: ReportData, m: ReportManual) {
  const rows = [0, 1, 2]
    .map((i) => ({ issue: (m.issues[i] || "").trim() || d.issues[i] || "", fb: (m.feedback[i] || "").trim() }))
    .filter((r) => r.issue || r.fb);
  const bullets = (t: string): PptxGenJS.TextProps[] => t.split(/\n+/).map((x) => x.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean).map((x) => ({ text: x, options: { bullet: { indent: 14 }, breakLine: true, paraSpaceAfter: 4 } }));
  // pick the largest font whose wrapped lines fit every row on the slide
  const issueW = 5.1;
  const pad = 0.14;
  const lines = (t: string, w: number, fs: number) => t.split(/\n+/).map((x) => x.trim()).filter(Boolean).reduce((a, x) => a + Math.max(1, Math.ceil(textW(x, fs) / w)), 0);
  const need = (fs: number) =>
    rows.map((r) => {
      const li = r.issue ? lines(r.issue, issueW - 2 * pad, fs) : 1;
      const nb = r.fb ? r.fb.split(/\n+/).filter((x) => x.trim()).length : 0;
      const lf = r.fb ? lines(r.fb, CW - issueW - 2 * pad - 0.25, fs) : 1;
      return Math.max(li * fs * 1.2, lf * fs * 1.2 + nb * 4) / 72 + 0.2;
    });
  const avail = BOTTOM - 1.75 - 0.6;
  let fs = 15;
  while (fs > 7 && need(fs).reduce((a, b) => a + b, 0) > avail) fs--;
  const minH = need(fs);
  const spare = Math.max(0, avail - minH.reduce((a, b) => a + b, 0));
  const rowHs = minH.map((h) => Math.max(h, Math.min(1.75, h + spare / Math.max(1, rows.length))));
  s.addTable(
    [
      [H("Issue"), H("Analisa & Feedback")],
      ...rows.map((r) => [
        { text: r.issue, options: { align: "left" as const, fill: { color: "FFFFFF" } } },
        r.fb ? { text: bullets(r.fb), options: { align: "left" as const, fill: { color: "FFFFFF" } } } : { text: "", options: { fill: { color: "FFFFFF" } } },
      ]),
    ] as Cell[][],
    { x: X, y: 1.75, w: CW, colW: [issueW, CW - issueW], fontFace: BODY_FONT, fontSize: fs, color: C.text, border: { type: "solid", pt: 0.5, color: C.line }, valign: "middle", margin: [0.08, 0.14, 0.08, 0.14], rowH: [0.6, ...rowHs] },
  );
}

function thanks(p: Pptx) {
  const s = p.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape("roundRect", { x: 2.5, y: -0.4, w: 8.33, h: 1.7, fill: { color: C.sky }, rectRadius: 0.3 });
  s.addText("THANK\nYOU!", { x: 3, y: 2.0, w: 7.33, h: 3.0, fontFace: TITLE_FONT, fontSize: 80, color: C.navy, bold: true, align: "center", margin: 0, lineSpacingMultiple: 0.85 });
  s.addText("›››››", { x: 2.2, y: 3.0, w: 1.8, h: 0.9, fontSize: 40, color: "8DB3E2", bold: true, margin: 0, valign: "middle" });
  s.addText("‹‹‹‹‹", { x: 9.35, y: 3.0, w: 1.8, h: 0.9, fontSize: 40, color: "8DB3E2", bold: true, align: "right", margin: 0, valign: "middle" });
  s.addShape("roundRect", { x: 5.28, y: 5.55, w: 2.77, h: 0.48, fill: { color: "5389CA" }, rectRadius: 0.24 });
  s.addShape("rect", { x: 0, y: 6.55, w: W, h: 0.95, fill: { color: C.navy } });
}

/** "QF10 Closing Oktober 2026.pptx" */
export const deckFileName = (d: ReportData) => `${d.storeCode ? d.storeCode + " " : ""}${d.title}.pptx`;
