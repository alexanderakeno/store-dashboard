/**
 * Draws the Weekly / Closing deck (16:9) from ReportData + what the user typed in the pop-up.
 * Same look as the store's Canva deck: white header band, light-blue body, navy titles, dark purple
 * table headers, green / red cells for up / down. Runs in the browser (and in Node for the audit).
 */
import type PptxGenJS from "pptxgenjs";
import type { AccVasRow, ReportData, SlideId, StaffRowData } from "@/lib/domain/report";

type Pptx = PptxGenJS;
type Slide = PptxGenJS.Slide;
type Cell = PptxGenJS.TableCell;
type CellOpts = PptxGenJS.TableCellProps;

export interface ReportManual {
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
  bnpl: { colA: string; colB: string; per: Record<string, { a: number | null; b: number | null }> };
  /** Typed replacements for the auto "Issue" cells ('' = keep the automatic text). */
  issues: string[];
  feedback: string[];
}

export function defaultManual(d: ReportData, author: string): ReportManual {
  const skip: SlideId[] = ["npi"];
  if (!d.bnpl.value) skip.push("bnpl");
  if (!d.ytd.some((r) => r.prev && r.cur)) skip.push("ytd");
  return {
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
    bnpl: { ...base.bnpl, ...(saved.bnpl ?? {}), per: { ...(saved.bnpl?.per ?? {}) } },
    issues: [0, 1, 2].map((i) => saved.issues?.[i] ?? ""),
    feedback: [0, 1, 2].map((i) => saved.feedback?.[i] ?? ""),
    skip: Array.isArray(saved.skip) ? saved.skip : base.skip,
  };
}

/* ---------------- look ---------------- */

const C = { navy: "12305F", purple: "1F1A4D", sky: "E0ECFB", blue: "4F86C6", grey: "D9D9D9", cream: "FFF2CC", green: "B7E1CD", red: "F4C7C3", ring: "C9DAF2", amount: "CFE2F3", total: "D9D9D9" };
const W = 13.333;
const TITLE_FONT = "Arial Black";
const BODY_FONT = "Calibri";

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const n0 = (n: number | null | undefined) => (n == null ? "-" : Math.round(n) === 0 ? "-" : nf.format(Math.round(n)));
const nz = (n: number | null | undefined) => (n == null ? "-" : nf.format(Math.round(n)));
const neg = (n: number | null | undefined) => (n == null ? "-" : Math.round(n) === 0 ? "-" : n < 0 ? `(${nf.format(Math.round(-n))})` : nf.format(Math.round(n)));
const pc = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "-" : `${Math.round(n)}%`);
const pc1 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "-" : `${n.toFixed(1).replace(".", ",")}%`);
const dec = (n: number | null | undefined, d = 1) => (n == null || !Number.isFinite(n) ? "-" : n.toFixed(d));
const growth = (a: number, b: number) => (b ? (a / b - 1) * 100 : null);
const share = (a: number, t: number) => (t ? (a / t) * 100 : null);
const jt = (n: number | null | undefined) => (n == null ? "-" : `${(n / 1e6).toFixed(1).replace(".", ",")} jt`);

const H = (t: string, o: CellOpts = {}): Cell => ({ text: t, options: { fill: { color: C.purple }, color: "FFFFFF", bold: true, align: "center", ...o } });
const G = (t: string, o: CellOpts = {}): Cell => ({ text: t, options: { fill: { color: C.grey }, bold: true, align: "center", ...o } });
const L = (t: string, o: CellOpts = {}): Cell => ({ text: t, options: { bold: true, align: "left", fill: { color: "FFFFFF" }, ...o } });
const N = (t: string | number, o: CellOpts = {}): Cell => ({ text: String(t), options: { align: "right", fill: { color: "FFFFFF" }, ...o } });
const T = (t: string, o: CellOpts = {}): Cell => ({ text: t, options: { align: "right", bold: true, fill: { color: C.total }, ...o } });
const TL = (t: string): Cell => T(t, { align: "left" });
const upDown = (v: number | null | undefined, text: string, o: CellOpts = {}) => N(text, { fill: { color: v == null || Math.round(v) === 0 ? "FFFFFF" : v > 0 ? C.green : C.red }, ...o });
const has = (v: number) => N(n0(v), { fill: { color: v ? C.green : C.red } });

function table(s: Slide, rows: Cell[][], o: PptxGenJS.TableProps & { rowH?: number | number[] }) {
  s.addTable(rows, { fontFace: BODY_FONT, fontSize: 13, color: "000000", border: { type: "solid", pt: 0.75, color: "7F7F7F" }, valign: "middle", margin: [0.02, 0.07, 0.02, 0.07], ...o });
}

/** Row height that fits `rows` into `space` inches (between `min` and `max`). */
const fit = (rows: number, space: number, max = 0.48, min = 0.26) => Math.max(min, Math.min(max, space / rows));
/** Font that suits a row height. */
const fontFor = (rowH: number, max = 14) => Math.max(9, Math.min(max, Math.round(rowH * 42)));

/* ---------------- deck ---------------- */

export function buildDeck(Ctor: new () => Pptx, d: ReportData, m: ReportManual, logo: string | null): Pptx {
  const p = new Ctor();
  p.layout = "LAYOUT_WIDE";
  p.author = m.author || d.storeCode;
  p.company = "Digiplus";
  p.title = `${d.storeCode} ${d.title}`;
  const objects: NonNullable<PptxGenJS.SlideMasterProps["objects"]> = [
    { rect: { x: 0, y: 1.2, w: W, h: 6.3, fill: { color: C.sky } } },
    { text: { text: "›››››", options: { x: 10.55, y: 1.25, w: 1.45, h: 0.55, fontSize: 34, color: C.blue, bold: true, fontFace: "Arial" } } },
  ];
  if (logo) objects.push({ image: { x: 9.75, y: 0.12, w: 3.2, h: 0.67, data: logo } });
  p.defineSlideMaster({ title: "CONTENT", background: { color: "FFFFFF" }, objects });

  const on = (id: SlideId) => !m.skip.includes(id);
  const vs = d.hasPrev ? `${d.curLabel} VS ${d.prevLabel}` : `${d.curLabel} ${d.year}`;
  const add = (l1: string, l2?: string) => {
    const s = p.addSlide({ masterName: "CONTENT" });
    s.addShape("ellipse", { x: 11.9, y: 0.75, w: 0.7, h: 0.7, fill: { color: C.sky }, line: { color: C.ring, width: 9 } });
    s.addText(l1, { x: 0.45, y: 0.5, w: 9.3, h: 0.68, fontFace: TITLE_FONT, fontSize: 28, color: C.navy, bold: true, margin: 0, fit: "shrink" });
    if (l2) s.addText(l2, { x: 0.45, y: 1.2, w: 9.9, h: 0.65, fontFace: TITLE_FONT, fontSize: 28, color: C.navy, bold: true, margin: 0, fit: "shrink" });
    return s;
  };
  const note = (s: Slide, text: string, y = 7.05) => s.addText(text, { x: 0.45, y, w: 12.4, h: 0.35, fontSize: 10, bold: true, color: C.navy, fontFace: BODY_FONT, margin: 0 });

  if (on("cover")) cover(p, d, m, logo);
  if (on("target")) slideTarget(add(`Target & Achievement${d.hasPrev ? " MTM" : ""}${d.hasLy ? `${d.hasPrev ? " -" : ""} LFL` : ""}`, vs), d);
  if (on("staff")) slideStaff(add("Target & Achievement per Staff", vs), d, note);
  if (on("balance")) slideBalance(add("Breakdown Staff Brand Balanced &", `Contribution ${d.curLabel}`), d, note);
  if (on("android")) slideSplit(add("Breakdown Staff Perfomance", `Android ${d.curLabel}`), d, "android");
  if (on("apple")) slideSplit(add("Breakdown Staff Perfomance", `Apple ${d.curLabel}`), d, "apple");
  if (on("accvas")) slideAccVas(add("Breakdown Acc & VAS", vs), d, note);
  if (on("productivity")) slideProductivity(add("Compare Productivity", vs), d, m);
  if (on("weekly")) slideWeekly(add("Weekly Performance", `${d.monthName} ${d.year} (W1${d.weeks.length > 1 ? ` - W${d.weeks.length}` : ""})`), d);
  if (on("npi")) slideNpi(add(m.npi.title1 || "NPI", m.npi.title2 || undefined), m);
  if (on("bnpl")) slideBnpl(add("Kontribusi BNPL", `(Buy Now Pay Later) ${d.monthName} ${d.year}`), d, m);
  if (on("ytd")) slideYtd(add("YTD Performance", `Jan - ${d.ytd[d.ytd.length - 1]?.label ?? ""} ${d.ytdYears[1]} VS ${d.ytdYears[0]}`), d, note);
  if (on("lob")) slideLob(add("Breakdown LOB Per Brand", vs), d);
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
  const name = (d.storeName || "").toUpperCase().replace(/^DIGIPLUS\s+/, "DIGIPLUS ");
  s.addText([code, ...wrap(name, 16)].filter(Boolean).join("\n"), { x: 1.1, y: 1.0, w: 8.4, h: 3.1, fontFace: TITLE_FONT, fontSize: 48, color: C.navy, bold: true, margin: 0, lineSpacingMultiple: 0.9, valign: "middle", fit: "shrink" });
  s.addText(d.title.toUpperCase(), { x: 1.2, y: 4.45, w: 9, h: 0.65, fontFace: TITLE_FONT, fontSize: 28, color: C.navy, margin: 0, fit: "shrink" });
  if (m.author) s.addText(m.author, { x: 1.15, y: 5.25, w: 9, h: 0.4, fontFace: "Arial", fontSize: 18, bold: true, color: "111111", margin: 0 });
  s.addText("›››››", { x: 1.7, y: 6.15, w: 1.5, h: 0.5, fontSize: 34, color: C.blue, bold: true });
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
  const cream = { fill: { color: C.cream } };
  const rows = d.groups.map((g) => {
    const hi = g.group === "Amount";
    const f: CellOpts = hi ? { fill: { color: C.amount }, bold: true } : {};
    const c: CellOpts = { ...cream, bold: hi };
    return [L(g.group, f), N(nz(g.target), { bold: true, ...f }), N(nz(g.mtd), f), N(pc(g.achPct), c), ...(d.hasPrev ? [N(g.mtm == null ? "-" : nz(g.mtm), f), N(pc(g.mtmGrowth), c)] : []), ...(d.hasLy ? [N(g.lfl == null ? "-" : nz(g.lfl), f), N(pc(g.lflGrowth), c)] : [])];
  });
  const head1 = [H(String(d.day)), H(""), H("Ideal"), H(pc(d.timeGonePct)), ...(d.hasPrev ? [H(""), H("")] : []), ...(d.hasLy ? [H(""), H("")] : [])];
  const head2 = [G(`${d.monthName} ${d.year}`), G("Target"), G("MTD"), G("%"), ...(d.hasPrev ? [G(`MTM (${d.prevShort})`), G("Growth")] : []), ...(d.hasLy ? [G(`LFL (${d.lyShort})`), G("Growth")] : [])];
  const w = 1.475 * head1.length;
  table(s, [head1, head2, ...rows], { x: 0.75, y: 2.45, w, rowH: 0.6, fontSize: 15 });
}

const staffOnly = (d: ReportData) => d.staff.filter((r) => r.kind === "staff");

function slideStaff(s: Slide, d: ReportData, note: (s: Slide, t: string, y?: number) => void) {
  const st = staffOnly(d);
  const extra = d.staff.filter((r) => r.kind !== "staff");
  const tRows = st.length + 3;
  const aRows = st.length + extra.length + 3;
  const rowH = fit(tRows + aRows, 4.75, 0.38, 0.2);
  const fs = fontFor(rowH, 12);
  const sum = (k: "Apple" | "Android" | "ACC" | "VAS") => st.reduce((a, r) => a + r.target[k], 0);
  const tTot = st.reduce((a, r) => a + r.targetTotal, 0);
  table(
    s,
    [
      [H(""), H("Target", { colspan: 5 })],
      [G(""), G("Apple"), G("Android"), G("Accesories"), G("VAS"), G("Total", { fill: { color: C.amount } })],
      ...st.map((r) => [L(r.name), N(nz(r.target.Apple)), N(nz(r.target.Android)), N(nz(r.target.ACC)), N(nz(r.target.VAS)), N(nz(r.targetTotal), { bold: true })]),
      [TL("Total"), T(nz(sum("Apple"))), T(nz(sum("Android"))), T(nz(sum("ACC"))), T(nz(sum("VAS"))), T(nz(tTot), { fill: { color: C.amount } })],
    ],
    { x: 3.0, y: 1.95, w: 7.9, rowH, fontSize: fs, colW: [1.45, 1.35, 1.3, 1.3, 1.2, 1.3] },
  );
  const yA = 1.95 + rowH * tRows + 0.12;
  const v = (r: StaffRowData, g: "Apple" | "Android" | "ACC" | "VAS") => (r.kind === "staff" ? upDown(r.actual[g] - r.target[g], neg(r.actual[g] - r.target[g])) : N("-"));
  const tb = d.storeTotals;
  table(
    s,
    [
      [H(""), H("Achievement", { colspan: 10 })],
      [G(""), G("Apple"), G("Var"), G("Android"), G("Var"), G("Accesories"), G("Var"), G("VAS"), G("Var"), G("Total"), G("%")],
      ...[...st, ...extra].map((r) => [L(r.name), N(n0(r.actual.Apple)), v(r, "Apple"), N(n0(r.actual.Android)), v(r, "Android"), N(n0(r.actual.ACC)), v(r, "ACC"), N(n0(r.actual.VAS)), v(r, "VAS"), N(n0(r.total), { bold: true }), N(r.kind === "staff" ? pc(r.achPct) : "-", { bold: true })]),
      [TL("Total"), T(nz(tb.actual.Apple)), T(neg(tb.actual.Apple - tb.targetByGroup.Apple)), T(nz(tb.actual.Android)), T(neg(tb.actual.Android - tb.targetByGroup.Android)), T(nz(tb.actual.ACC)), T(neg(tb.actual.ACC - tb.targetByGroup.ACC)), T(nz(tb.actual.VAS)), T(neg(tb.actual.VAS - tb.targetByGroup.VAS)), T(nz(tb.total)), T(pc(share(tb.total, tb.target)))],
    ],
    { x: 0.35, y: yA, w: 12.65, rowH, fontSize: fs, colW: [1.1, 1.38, 1.3, 1.12, 1.15, 1.1, 1.12, 1.05, 1.15, 1.43, 0.75] },
  );
  if (extra.length) note(s, "*Online = Digiplus.co.id + Mapemall + Mapemallonline. Var = actual − target bulan penuh.", Math.min(7.12, yA + rowH * aRows + 0.05));
}

function slideBalance(s: Slide, d: ReportData, note: (s: Slide, t: string, y?: number) => void) {
  const b = d.balance;
  table(
    s,
    [
      [H("Brand balance by Value", { colspan: 2 }), H("Brand balance by QTY", { colspan: 2 })],
      [H("Apple", { bold: false }), H("Android", { bold: false }), H("Apple", { bold: false }), H("Android", { bold: false })],
      [N(pc(b.value?.[0]), { align: "center" }), N(pc(b.value?.[1]), { align: "center" }), N(pc(b.qty?.[0]), { align: "center" }), N(pc(b.qty?.[1]), { align: "center" })],
    ],
    { x: 3.4, y: 2.0, w: 5.2, rowH: 0.4, fontSize: 12 },
  );
  const rows = d.staff;
  const rowH = fit(rows.length + 3, 3.5, 0.32, 0.22);
  const fs = fontFor(rowH, 15);
  const t = d.storeTotals;
  table(
    s,
    [
      [H("Target Category", { align: "left" }), H(""), H(""), H(""), H(""), H("")],
      [G("Contribution", { align: "left" }), G("Achievement"), G("Contribution"), G("Invoice"), G("ATV"), G("UPT")],
      ...rows.map((r) => [L(r.name), N(nz(r.total), { align: "center" }), N(pc(share(r.total, t.total))), N(nz(r.invoices)), N(nz(r.atv)), N(dec(r.upt))]),
      [TL("Total"), T(nz(t.total), { align: "center" }), T("100%"), T(nz(t.invoices)), T(nz(t.atv)), T(dec(t.upt))],
    ],
    { x: 0.7, y: 3.55, w: 11.9, rowH, fontSize: fs },
  );
  const parts = [];
  if (rows.some((r) => r.kind === "online")) parts.push("*Online = Digiplus.co.id + Mapemall + Mapemallonline.");
  if (t.rowInvoices !== t.invoices) parts.push(`Total invoice unik level toko (jumlah per baris ${nz(t.rowInvoices)} karena sebagian invoice tercatat di lebih dari 1 akun).`);
  if (parts.length) note(s, parts.join("  "), Math.min(7.1, 3.55 + rowH * (rows.length + 3) + 0.05));
}

function slideSplit(s: Slide, d: ReportData, kind: "android" | "apple") {
  const cols = kind === "android" ? d.androidBrands : d.appleLobs;
  const label = (c: string) => (kind === "apple" ? ({ "Apple Watch": "Apple watch", Mac: "Macbook" } as Record<string, string>)[c] ?? c : c);
  const rows = d.staff;
  const get = (r: StaffRowData, c: string) => (kind === "android" ? r.android[c] : r.apple[c]) ?? { qty: 0, value: 0 };
  const sumQ = (c: string) => rows.reduce((a, r) => a + get(r, c).qty, 0);
  const sumV = (c: string) => rows.reduce((a, r) => a + get(r, c).value, 0);
  const tq = cols.reduce((a, c) => a + sumQ(c), 0);
  const tv = cols.reduce((a, c) => a + sumV(c), 0);
  const nRows = rows.length + 3;
  const rowH = fit(nRows * 2, 5.2, 0.4, 0.2);
  const fs = fontFor(rowH, 13);
  const w = Math.min(12.4, 1.6 + cols.length * 1.55 + 1.6);
  const colW = [1.6, ...cols.map(() => (w - 3.2) / cols.length), 1.6];
  const cont = (vals: Array<number | null>) => [G("Contribution", { align: "left", fill: { color: C.grey } }), ...vals.map((v) => N(pc(v), { align: "center", fill: { color: C.grey } })), N("", { fill: { color: C.grey } })];
  const head = [H("Detail"), ...cols.map((c) => H(label(c))), H("Total")];
  table(
    s,
    [
      cont(cols.map((c) => share(sumQ(c), tq))),
      head,
      ...rows.map((r) => [L(r.name), ...cols.map((c) => has(get(r, c).qty)), N(n0(cols.reduce((a, c) => a + get(r, c).qty, 0)))]),
      [TL("Total"), ...cols.map((c) => T(nz(sumQ(c)))), T(nz(tq))],
    ],
    { x: 0.45, y: 1.95, w, rowH, fontSize: fs, colW },
  );
  table(
    s,
    [
      cont(cols.map((c) => share(sumV(c), tv))),
      head,
      ...rows.map((r) => [L(r.name), ...cols.map((c) => N(n0(get(r, c).value))), N(n0(cols.reduce((a, c) => a + get(r, c).value, 0)), { bold: true })]),
      [TL("Total"), ...cols.map((c) => T(nz(sumV(c)))), T(nz(tv))],
    ],
    { x: 0.45, y: 1.95 + rowH * nRows + 0.2, w, rowH, fontSize: fs, colW },
  );
}

function slideAccVas(s: Slide, d: ReportData, note: (s: Slide, t: string, y?: number) => void) {
  const rows = d.accVas;
  const rowH = fit((rows.length + 2) * 2, 4.9, 0.44, 0.2);
  const fs = fontFor(rowH, 13);
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
      [H("ACC"), H("Acc Exc Airpods"), H("MTM"), H("Difference"), H("Airpods"), H("MTM"), H("Difference")],
      ...rows.map((r) => [L(r.name), N(n0(r.accEx)), N(n0(r.accExPrev)), diff(r.accEx, r.accExPrev), N(n0(r.airpods)), N(n0(r.airpodsPrev)), diff(r.airpods, r.airpodsPrev)]),
      [TL("Total"), T(n0(tot.accEx)), T(n0(tot.accExPrev)), T(neg(tot.accEx - tot.accExPrev)), T(n0(tot.airpods)), T(n0(tot.airpodsPrev)), T(neg(tot.airpods - tot.airpodsPrev))],
    ],
    { x: 0.75, y: 1.95, w: 11.8, rowH, fontSize: fs },
  );
  const vRows = rows.filter((r) => r.name !== "Lainnya*" || r.vasTotal || r.qoalaPrev);
  table(
    s,
    [
      [H("VAS"), H("Qoala"), H("MTM"), H("Difference"), H("%"), H("Telkomsel"), H("XL"), H("Indosat"), H("Total")],
      ...vRows.map((r) => [L(r.name), N(n0(r.qoala)), N(n0(r.qoalaPrev)), diff(r.qoala, r.qoalaPrev), (d.hasPrev ? upDown(r.qoala - r.qoalaPrev, pc(growth(r.qoala, r.qoalaPrev)), { bold: true }) : N("-")), N(n0(r.telkomsel)), N(n0(r.xl)), N(n0(r.indosat)), N(n0(r.vasTotal), { bold: true })]),
      [TL("Total"), T(n0(tot.qoala)), T(n0(tot.qoalaPrev)), T(neg(tot.qoala - tot.qoalaPrev)), T(pc(growth(tot.qoala, tot.qoalaPrev))), T(n0(tot.telkomsel)), T(n0(tot.xl)), T(n0(tot.indosat)), T(n0(tot.vasTotal))],
    ],
    { x: 0.75, y: 1.95 + rowH * (rows.length + 2) + 0.15, w: 11.8, rowH, fontSize: fs },
  );
  if (rows.some((r) => r.name === "Lainnya*")) s.addText("*Lainnya = Online (Digiplus.co.id, Mapemall, Mapemallonline) + staff lain. ACC exc Airpods = ACC dikurangi Airpods.", { x: 8.2, y: 1.25, w: 2.3, h: 0.6, fontSize: 9, bold: true, color: C.navy, fontFace: BODY_FONT, margin: 0, fit: "shrink" });
  void note;
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
  const rows: Array<[string, string, string]> = [
    ["Amount", nz(c.amount), p ? nz(p.amount) : "-"],
    ["D Sales Avg", nz(c.dailyAvg), p ? nz(p.dailyAvg) : "-"],
    ["Brand Balance", bal(c.balance), p ? bal(p.balance) : "-"],
    ["Invoice", nz(c.invoices), p ? nz(p.invoices) : "-"],
    ["Traffic", tc ? nz(tc) : "-", tp ? nz(tp) : "-"],
    ["UPT", dec(c.upt), p ? dec(p.upt) : "-"],
    ["CVR", pc1(cvr(c, tc, m.traffic.cur)), p ? pc1(cvr(p, tp, m.traffic.prev)) : "-"],
    ["ATV", nz(c.atv), p ? nz(p.atv) : "-"],
  ];
  table(s, [[H(d.storeCode || "Toko", { align: "left" }), H(d.mode === "closing" ? "This Month" : d.curLabel), H(d.mode === "closing" ? "Last Month" : d.prevLabel)], ...rows.map(([k, a, b]) => [L(k), N(a), N(b)])], { x: 0.75, y: 2.5, w: 5.2, rowH: 0.5, fontSize: 16, colW: [1.7, 1.75, 1.75] });
}

function slideWeekly(s: Slide, d: ReportData) {
  const w = d.weeks;
  const t = d.weeksTotal;
  const head = [H(d.storeCode || "Toko", { align: "left" }), ...w.map((x) => H(x.label)), H(d.mode === "closing" ? `Total ${d.monthName.slice(0, 3)}` : "MTD")];
  const r = (label: string, vals: string[], tot: string) => [L(label), ...vals.map((v) => N(v)), N(tot)];
  const cols = w.length + 2;
  const colW = [1.7, ...Array(cols - 1).fill((11.8 - 1.7) / (cols - 1))];
  table(
    s,
    [
      head,
      r("Periode", w.map((x) => x.period), t.period),
      r("Sales", w.map((x) => nz(x.sales)), nz(t.sales)),
      r("Target", w.map((x) => nz(x.target)), nz(t.target)),
      r("Achievement", w.map((x) => pc(x.achPct)), pc(t.achPct)),
      r("Transaksi", w.map((x) => nz(x.trx)), nz(t.trx)),
      r("UPT", w.map((x) => dec(x.upt, 2)), dec(t.upt, 2)),
      r("ATV", w.map((x) => jt(x.atv)), jt(t.atv)),
      r("vs Week Lalu", w.map((x) => (x.vsPrev == null ? "-" : pc(x.vsPrev))), t.mtmGrowth == null ? "-" : `${t.mtmGrowth >= 0 ? "+" : ""}${Math.round(t.mtmGrowth)}% MTM`),
    ],
    { x: 0.75, y: 2.5, w: 11.8, rowH: 0.5, fontSize: w.length > 5 ? 14 : 16, colW },
  );
}

function slideNpi(s: Slide, m: ReportManual) {
  const n = m.npi;
  const v = (x: number | null) => x ?? 0;
  const ta = n.rows.reduce((a, r) => a + v(r.a), 0);
  const tb = n.rows.reduce((a, r) => a + v(r.b), 0);
  table(
    s,
    [
      [H(n.period ? `NPI (${n.period})` : "NPI", { align: "left" }), H(n.colA || "-"), H(n.colB || "-"), H("TOTAL")],
      ...n.rows.filter((r) => r.label.trim()).map((r) => [L(r.label), N(nz(v(r.a))), N(nz(v(r.b))), N(nz(v(r.a) + v(r.b)))]),
      [H("TOTAL"), H(nz(ta)), H(nz(tb)), H(nz(ta + tb))],
    ],
    { x: 0.75, y: 2.45, w: 6.4, rowH: 0.5, fontSize: 16 },
  );
  const duo = n.duo.filter((r) => r.label.trim());
  const td = duo.reduce((a, r) => a + v(r.unit), 0);
  if (n.duoTitle.trim() || td) {
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
      { x: 7.45, y: 2.45, w: 5.1, rowH: 0.5, fontSize: 16, colW: [2.3, 1.4, 1.4] },
    );
  }
}

function slideBnpl(s: Slide, d: ReportData, m: ReportManual) {
  const b = d.bnpl;
  const per = (p: string) => m.bnpl.per[p] ?? { a: null, b: null };
  const withModels = b.rows.some((r) => per(r.provider).a || per(r.provider).b);
  const rows = b.rows.filter((r) => r.value || r.qty);
  const ta = rows.reduce((a, r) => a + (per(r.provider).a ?? 0), 0);
  const tb = rows.reduce((a, r) => a + (per(r.provider).b ?? 0), 0);
  const mc = (x: number | null) => N(x ? nz(x) : "-");
  table(
    s,
    [
      [H("BNPL", { align: "left" }), H("Total Value"), H("Kontribusi"), H("Kontrak"), H("Avg / Kontrak"), ...(withModels ? [H(m.bnpl.colA || "-"), H(m.bnpl.colB || "-"), H("Total")] : [])],
      ...rows.map((r) => [L(r.label), N(nz(r.value)), N(pc1(share(r.value, b.value))), N(nz(r.qty)), N(r.qty ? nz(r.value / r.qty) : "-"), ...(withModels ? [mc(per(r.provider).a), mc(per(r.provider).b), mc((per(r.provider).a ?? 0) + (per(r.provider).b ?? 0))] : [])]),
      [H("TOTAL"), H(nz(b.value)), H("100%"), H(nz(b.qty)), H(b.qty ? nz(b.value / b.qty) : "-"), ...(withModels ? [H(nz(ta)), H(nz(tb)), H(nz(ta + tb))] : [])],
    ],
    { x: 0.75, y: 2.45, w: withModels ? 11.85 : 8.2, rowH: 0.55, fontSize: 15 },
  );
  const sorted = [...rows].sort((x, y) => y.value - x.value);
  const sales = d.storeTotals.total;
  const parts = [`BNPL ${d.mode === "closing" ? d.monthName : d.curLabel} Rp${(b.value / 1e9).toFixed(2).replace(".", ",")} M dari ${b.qty} kontrak = ${pc1(share(b.value, sales))} dari total sales (Rp${(sales / 1e9).toFixed(2).replace(".", ",")} M), avg Rp${((b.qty ? b.value / b.qty : 0) / 1e6).toFixed(1).replace(".", ",")} jt/kontrak.`];
  if (sorted.length >= 2) parts.push(`${sorted[0].label} (${pc1(share(sorted[0].value, b.value))}) & ${sorted[1].label} (${pc1(share(sorted[1].value, b.value))}) menyumbang ${pc1(share(sorted[0].value + sorted[1].value, b.value))} value BNPL.`);
  if (withModels) parts.push(`Total ${ta + tb} unit ${[m.bnpl.colA, m.bnpl.colB].filter(Boolean).join(" & ")} via BNPL.`);
  if (b.value) s.addText(parts.join(" "), { x: 0.75, y: 6.25, w: 11.85, h: 0.95, fontSize: 15, bold: true, color: C.navy, fontFace: BODY_FONT, margin: 0, valign: "top", fit: "shrink" });
}

function slideYtd(s: Slide, d: ReportData, note: (s: Slide, t: string, y?: number) => void) {
  const [py, cy] = d.ytdYears;
  const rows = d.ytd;
  const both = rows.filter((r) => r.prev && r.cur);
  const tp = both.reduce((a, r) => ({ qty: a.qty + r.prev!.qty, value: a.value + r.prev!.value }), { qty: 0, value: 0 });
  const tc = both.reduce((a, r) => ({ qty: a.qty + r.cur!.qty, value: a.value + r.cur!.value }), { qty: 0, value: 0 });
  const rowH = fit(rows.length + 2, 4.8, 0.5, 0.3);
  const cr = { fill: { color: C.cream } };
  table(
    s,
    [
      [H("Bulan", { align: "left" }), H(`Qty ${py}`), H(`Value ${py}`), H(`Qty ${cy}`), H(`Value ${cy}`), H("Selisih Value"), H("Growth")],
      ...rows.map((r) => [L(r.upTo ? `${r.label} (1-${r.upTo})` : r.label), N(r.prev ? nz(r.prev.qty) : "-"), N(r.prev ? nz(r.prev.value) : "-"), N(r.cur ? nz(r.cur.qty) : "-", cr), N(r.cur ? nz(r.cur.value) : "-", cr), N(r.prev && r.cur ? neg(r.cur.value - r.prev.value) : "-"), N(r.prev && r.cur ? pc(growth(r.cur.value, r.prev.value)) : "-")]),
      [TL("Total YTD"), T(nz(tp.qty)), T(nz(tp.value)), T(nz(tc.qty)), T(nz(tc.value)), T(neg(tc.value - tp.value)), T(pc(growth(tc.value, tp.value)))],
    ],
    { x: 0.75, y: 2.3, w: 11.8, rowH, fontSize: fontFor(rowH, 15) },
  );
  const miss = rows.filter((r) => !(r.prev && r.cur)).map((r) => r.label);
  if (miss.length) note(s, `Total YTD hanya bulan yang datanya ada di kedua tahun (tanpa ${miss.join(", ")}).`, Math.min(7.1, 2.3 + rowH * (rows.length + 2) + 0.08));
}

function slideLob(s: Slide, d: ReportData) {
  const rows = d.lob;
  const rowH = fit(rows.length + 2, 5.3, 0.5, 0.24);
  const fs = fontFor(rowH, 14);
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
    { x: 0.75, y: 1.95, w: 11.8, rowH, fontSize: fs, colW: [1.75, 1.0, 1.0, 1.0, 1.0, 1.55, 1.55, 1.55, 1.4] },
  );
}

function slideIssue(s: Slide, d: ReportData, m: ReportManual) {
  const rows = [0, 1, 2]
    .map((i) => ({ issue: (m.issues[i] || "").trim() || d.issues[i] || "", fb: (m.feedback[i] || "").trim() }))
    .filter((r) => r.issue || r.fb);
  const bullets = (t: string): PptxGenJS.TextProps[] => t.split(/\n+/).map((x) => x.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean).map((x) => ({ text: x, options: { bullet: true, breakLine: true } }));
  const totalLen = rows.reduce((a, r) => a + Math.max(r.issue.length, r.fb.length), 0);
  const fs = totalLen > 900 ? 12 : totalLen > 600 ? 14 : 16;
  s.addTable(
    [
      [H("Issue"), H("Analisa & Feedback")],
      ...rows.map((r) => [
        { text: r.issue, options: { align: "left" as const, fill: { color: "FFFFFF" } } },
        r.fb ? { text: bullets(r.fb), options: { align: "left" as const, fill: { color: "FFFFFF" } } } : { text: "", options: { fill: { color: "FFFFFF" } } },
      ]),
    ] as Cell[][],
    { x: 0.75, y: 1.75, w: 11.8, colW: [4.95, 6.85], fontFace: BODY_FONT, fontSize: fs, color: "000000", border: { type: "solid", pt: 0.75, color: "7F7F7F" }, valign: "middle", margin: [0.06, 0.1, 0.06, 0.1], rowH: [0.65, ...rows.map(() => 1.5)] },
  );
}

function thanks(p: Pptx) {
  const s = p.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape("roundRect", { x: 2.5, y: -0.4, w: 8.33, h: 1.7, fill: { color: C.sky }, rectRadius: 0.3 });
  s.addText("THANK\nYOU!", { x: 3, y: 2.0, w: 7.33, h: 3.0, fontFace: TITLE_FONT, fontSize: 80, color: C.navy, bold: true, align: "center", margin: 0, lineSpacingMultiple: 0.85 });
  s.addText("›››››", { x: 2.4, y: 3.15, w: 1.5, h: 0.6, fontSize: 40, color: "8DB3E2", bold: true });
  s.addText("‹‹‹‹‹", { x: 9.45, y: 3.15, w: 1.5, h: 0.6, fontSize: 40, color: "8DB3E2", bold: true, align: "right" });
  s.addShape("roundRect", { x: 5.28, y: 5.55, w: 2.77, h: 0.48, fill: { color: "5389CA" }, rectRadius: 0.24 });
  s.addShape("rect", { x: 0, y: 6.55, w: W, h: 0.95, fill: { color: C.navy } });
}

/** "QF10 Closing Oktober 2026.pptx" */
export const deckFileName = (d: ReportData) => `${d.storeCode ? d.storeCode + " " : ""}${d.title}.pptx`;
