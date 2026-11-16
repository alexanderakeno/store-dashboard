/**
 * The Weekly / Closing deck as a PDF, in the browser: buildDeck() draws into a recorder with the same calls it
 * makes on PptxGenJS (so the layout stays one piece of code), each slide is painted on a canvas and the
 * pages are written with the minimal PDF writer. Text is rasterised at 200 px/inch (sharp on screen and print).
 */
import { buildPdf, type PdfImage, type PdfPage } from "@/lib/priceTicket/pdf";
import type { ReportData } from "@/lib/domain/report";
import { buildDeck, type ReportManual } from "./pptx";

/* ---------------- recorder (the subset of PptxGenJS that buildDeck uses) ---------------- */

type Any = Record<string, unknown>;
type Op = { kind: "text"; text: unknown; o: Any } | { kind: "shape"; shape: string; o: Any } | { kind: "table"; rows: unknown[][]; o: Any } | { kind: "image"; o: Any };
interface RecSlide {
  background: string;
  ops: Op[];
}

class RecSlideApi {
  constructor(readonly rec: RecSlide) {}
  addText(text: unknown, o: Any) {
    this.rec.ops.push({ kind: "text", text, o });
    return this;
  }
  addShape(shape: string, o: Any) {
    this.rec.ops.push({ kind: "shape", shape, o });
    return this;
  }
  addTable(rows: unknown[][], o: Any) {
    this.rec.ops.push({ kind: "table", rows, o });
    return this;
  }
  addImage(o: Any) {
    this.rec.ops.push({ kind: "image", o });
    return this;
  }
}

class Recorder {
  layout = "LAYOUT_WIDE";
  author = "";
  company = "";
  title = "";
  slides: RecSlide[] = [];
  private masters = new Map<string, { background: string; ops: Op[] }>();
  defineSlideMaster(m: { title: string; background?: { color?: string }; objects?: Array<Record<string, Any>> }) {
    const ops: Op[] = [];
    for (const ob of m.objects ?? []) {
      if (ob.rect) ops.push({ kind: "shape", shape: "rect", o: ob.rect });
      else if (ob.text) ops.push({ kind: "text", text: (ob.text as Any).text, o: ((ob.text as Any).options as Any) ?? {} });
      else if (ob.image) ops.push({ kind: "image", o: ob.image });
    }
    this.masters.set(m.title, { background: m.background?.color ?? "FFFFFF", ops });
  }
  addSlide(o?: { masterName?: string }) {
    const m = o?.masterName ? this.masters.get(o.masterName) : undefined;
    const rec: RecSlide = { background: m?.background ?? "FFFFFF", ops: [...(m?.ops ?? [])] };
    this.slides.push(rec);
    return new RecSlideApi(rec);
  }
}

/* ---------------- painter ---------------- */

const W_IN = 13.333;
const H_IN = 7.5;
const PX = 200; // px per inch
const col = (c: unknown, d = "000000") => `#${String(c ?? d).replace(/^#/, "")}`;
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const fontStack = (face: unknown) => {
  const f = String(face ?? "Arial");
  if (/arial black/i.test(f)) return `"Arial Black", "Arial", sans-serif`;
  if (/calibri/i.test(f)) return `"Calibri", "Carlito", "Segoe UI", "Arial", sans-serif`;
  return `"${f}", "Arial", sans-serif`;
};
const fontOf = (face: unknown, pt: number, bold: boolean) => `${/arial black/i.test(String(face)) ? 900 : bold ? 700 : 400} ${(pt / 72) * PX}px ${fontStack(face)}`;

interface Para {
  text: string;
  bullet: boolean;
  after: number; // pt
}
function paragraphs(text: unknown): Para[] {
  if (Array.isArray(text))
    return text.map((t: Any) => {
      const o = (t.options as Any) ?? {};
      return { text: String(t.text ?? ""), bullet: !!o.bullet, after: num(o.paraSpaceAfter) };
    });
  return String(text ?? "")
    .split("\n")
    .map((t) => ({ text: t, bullet: false, after: 0 }));
}

/** Greedy word wrap; a word wider than the line stays whole (it is squeezed when drawn). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(t).width > width) {
      out.push(line);
      line = w;
    } else line = t;
  }
  out.push(line);
  return out;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface TextStyle {
  face: unknown;
  pt: number;
  bold: boolean;
  color: string;
  align: string;
  valign: string;
  lsm: number;
  shrink: boolean;
}

/** Text in a box (px), wrapped, aligned, shrunk when asked (or when it would overflow a table cell). */
function drawText(ctx: CanvasRenderingContext2D, text: unknown, box: Box, st: TextStyle) {
  const paras = paragraphs(text);
  const indent = (pt: number) => ((pt * 1.1) / 72) * PX;
  const layout = (pt: number) => {
    ctx.font = fontOf(st.face, pt, st.bold);
    const lh = ((pt * 1.2 * st.lsm) / 72) * PX;
    const lines: Array<{ t: string; x0: number; bullet: boolean; gap: number }> = [];
    for (const p of paras) {
      const ind = p.bullet ? indent(pt) : 0;
      const ls = wrap(ctx, p.text, box.w - ind);
      ls.forEach((t, i) => lines.push({ t, x0: ind, bullet: p.bullet && i === 0, gap: i === ls.length - 1 ? (p.after / 72) * PX : 0 }));
    }
    const height = lines.reduce((a, l) => a + lh + l.gap, 0);
    return { lines, lh, height };
  };
  let pt = st.pt;
  let L = layout(pt);
  if (st.shrink) while (L.height > box.h + 0.5 && pt > 6) L = layout((pt -= 0.5));
  ctx.fillStyle = st.color;
  ctx.textBaseline = "alphabetic";
  let y = st.valign === "top" ? box.y : st.valign === "bottom" ? box.y + box.h - L.height : box.y + (box.h - L.height) / 2;
  const ascent = L.lh * 0.78;
  for (const l of L.lines) {
    const avail = box.w - l.x0;
    const tw = ctx.measureText(l.t).width;
    const k = tw > avail && avail > 0 ? avail / tw : 1;
    const drawW = tw * k;
    let x = box.x + l.x0;
    if (st.align === "center") x = box.x + l.x0 + (avail - drawW) / 2;
    else if (st.align === "right") x = box.x + box.w - drawW;
    if (l.bullet) ctx.fillText("•", box.x + l.x0 - indent(pt) * 0.75, y + ascent);
    ctx.save();
    ctx.translate(x, y + ascent);
    ctx.scale(k, 1);
    ctx.fillText(l.t, 0, 0);
    ctx.restore();
    y += L.lh + l.gap;
  }
}

function drawShape(ctx: CanvasRenderingContext2D, shape: string, o: Any) {
  const x = num(o.x) * PX, y = num(o.y) * PX, w = num(o.w) * PX, h = num(o.h) * PX;
  ctx.beginPath();
  if (shape === "ellipse") ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (shape === "roundRect") ctx.roundRect(x, y, w, h, Math.min(num(o.rectRadius) * PX, w / 2, h / 2));
  else ctx.rect(x, y, w, h);
  const fill = (o.fill as Any | undefined)?.color;
  if (fill) {
    ctx.fillStyle = col(fill);
    ctx.fill();
  }
  const line = o.line as Any | undefined;
  if (line?.color && num(line.width) > 0) {
    ctx.strokeStyle = col(line.color);
    ctx.lineWidth = (num(line.width) / 72) * PX;
    ctx.stroke();
  }
}

function drawTable(ctx: CanvasRenderingContext2D, rows: unknown[][], o: Any) {
  const nCols = Math.max(...rows.map((r) => (r as Any[]).reduce((a: number, c) => a + num(((c as Any).options as Any)?.colspan, 1), 0)));
  const colW = Array.isArray(o.colW) ? (o.colW as number[]) : Array(nCols).fill(num(o.w, 10) / nCols);
  const rowH = Array.isArray(o.rowH) ? (o.rowH as number[]) : rows.map(() => num(o.rowH, 0.4));
  const [mt, mr, mb, ml] = (Array.isArray(o.margin) ? o.margin : [0.02, 0.09, 0.02, 0.09]) as number[];
  const border = o.border as Any | undefined;
  const x0 = num(o.x), y0 = num(o.y);
  const cx = (c: number) => x0 + colW.slice(0, c).reduce((a, b) => a + b, 0);
  const ry = (r: number) => y0 + rowH.slice(0, r).reduce((a, b) => a + (b ?? rowH[rowH.length - 1]), 0);
  const busy: number[][] = rows.map(() => []);
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row as Any[]) {
      while (busy[r][c]) c++;
      const co = (cell.options as Any) ?? {};
      const cs = num(co.colspan, 1);
      const rs = num(co.rowspan, 1);
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) if (busy[r + i]) busy[r + i][c + j] = 1;
      const box = { x: cx(c) * PX, y: ry(r) * PX, w: (cx(c + cs) - cx(c)) * PX, h: (ry(r + rs) - ry(r)) * PX };
      const fill = (co.fill as Any | undefined)?.color;
      if (fill) {
        ctx.fillStyle = col(fill);
        ctx.fillRect(box.x, box.y, box.w, box.h);
      }
      if (border && num(border.pt) > 0) {
        ctx.strokeStyle = col(border.color, "BFBFBF");
        ctx.lineWidth = Math.max(1, (num(border.pt) / 72) * PX);
        ctx.strokeRect(box.x, box.y, box.w, box.h);
      }
      drawText(ctx, cell.text, { x: box.x + ml * PX, y: box.y + mt * PX, w: box.w - (ml + mr) * PX, h: box.h - (mt + mb) * PX }, {
        face: co.fontFace ?? o.fontFace,
        pt: num(co.fontSize, num(o.fontSize, 12)),
        bold: !!(co.bold ?? o.bold),
        color: col(co.color ?? o.color, "1F1F1F"),
        align: String(co.align ?? o.align ?? "left"),
        valign: String(co.valign ?? o.valign ?? "middle"),
        lsm: 1,
        shrink: true,
      });
      c += cs;
    }
  });
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Gambar gagal dimuat"));
    i.src = src;
  });

async function paint(slide: RecSlide): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  c.width = Math.round(W_IN * PX);
  c.height = Math.round(H_IN * PX);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = col(slide.background, "FFFFFF");
  ctx.fillRect(0, 0, c.width, c.height);
  for (const op of slide.ops) {
    if (op.kind === "shape") drawShape(ctx, op.shape, op.o);
    else if (op.kind === "table") drawTable(ctx, op.rows, op.o);
    else if (op.kind === "image") {
      const src = String(op.o.data ?? op.o.path ?? "");
      if (src) ctx.drawImage(await loadImage(src), num(op.o.x) * PX, num(op.o.y) * PX, num(op.o.w) * PX, num(op.o.h) * PX);
    } else {
      const o = op.o;
      drawText(ctx, op.text, { x: num(o.x) * PX, y: num(o.y) * PX, w: num(o.w) * PX, h: num(o.h) * PX }, {
        face: o.fontFace ?? "Arial",
        pt: num(o.fontSize, 18),
        bold: !!o.bold,
        color: col(o.color, "000000"),
        align: String(o.align ?? "left"),
        valign: String(o.valign ?? "middle"),
        lsm: num(o.lineSpacingMultiple, 1),
        shrink: o.fit === "shrink",
      });
    }
  }
  return c;
}

/** The deck as PDF bytes: one 16:9 page (33,87 × 19,05 cm) per slide. */
export async function deckPdf(d: ReportData, m: ReportManual, logo: string | null): Promise<Uint8Array> {
  const deck = buildDeck(Recorder as unknown as Parameters<typeof buildDeck>[0], d, m, logo) as unknown as Recorder;
  await document.fonts?.ready;
  const images: PdfImage[] = [];
  const pages: PdfPage[] = [];
  const wMm = W_IN * 25.4;
  const hMm = H_IN * 25.4;
  for (const s of deck.slides) {
    const c = await paint(s);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
    if (!blob) throw new Error("Gagal membuat gambar slide");
    images.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), px: c.width, py: c.height });
    pages.push({ w: wMm, h: hMm, items: [{ img: images.length - 1, x: 0, y: 0, w: wMm, h: hMm }] });
    c.width = c.height = 0;
  }
  return buildPdf(images, pages, deck.title || "Report");
}
