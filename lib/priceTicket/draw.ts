import { GLYPHS } from "@/lib/priceTicket/glyphs";
import { idNum, splitPrice } from "@/lib/domain/priceTicket";
import { isTextSlot, type AnySlot, type StrikeStyle, type TextSlot, type TicketSlot, type TicketTemplate } from "@/types/priceTicket";

const DOT = 1.19; // gap next to a dot, relative to the gap between digits
const RED = "#e3262f";

const paths = new Map<string, Path2D>();
const path = (k: string) => {
  let p = paths.get(k);
  if (!p) paths.set(k, (p = new Path2D(GLYPHS[k].d)));
  return p;
};

/** Width of `str` at digit height H with letter spacing `track` (in digit heights). */
export function measure(str: string, H: number, track: number): number {
  let w = 0;
  [...str].forEach((ch, i) => {
    const g = GLYPHS[ch];
    if (i) w += (ch === "." || str[i - 1] === "." ? DOT : 1) * track * H;
    w += g.w * (H / g.srcH);
  });
  return w;
}

/** Glyphs bottom-aligned on `baseline` from `x`; returns the right edge. */
/**
 * Fills a glyph; `w` (glyph units) makes it heavier (outline stroked in the ink) or lighter (outline stroked in white —
 * the price area is erased to white first), so the digits print with the design's weight.
 */
function fillWeighted(ctx: CanvasRenderingContext2D, p: Path2D, w: number) {
  ctx.fill(p);
  if (!w) return;
  const ink = ctx.fillStyle;
  ctx.save();
  ctx.strokeStyle = w > 0 ? ink : "#fff";
  ctx.lineWidth = Math.abs(w);
  ctx.lineJoin = "round";
  ctx.stroke(p);
  ctx.restore();
}

/** `wt` = extra stroke weight in px: matches the weight the design's text printed with. */
function drawStr(ctx: CanvasRenderingContext2D, str: string, x: number, baseline: number, H: number, track: number, wt = 0): number {
  [...str].forEach((ch, i) => {
    const g = GLYPHS[ch];
    const s = H / g.srcH;
    if (i) x += (ch === "." || str[i - 1] === "." ? DOT : 1) * track * H;
    ctx.save();
    ctx.translate(x - g.pad * s, baseline - (g.pad + g.h) * s);
    ctx.scale(s, s);
    fillWeighted(ctx, path(ch), wt / s);
    ctx.restore();
    x += g.w * s;
  });
  return x;
}

const rpWidth = (H: number) => {
  const s = H / GLYPHS.R.srcH;
  return GLYPHS.R.w * s + 0.08 * H + GLYPHS.p.w * s + 0.093 * H + GLYPHS["r."].w * s;
};

/** "Rp." ending `gap`·H left of `digitsX`, baseline 0.48·H under the digit top (H = digit height × `scale`). Returns its left edge. */
function drawRp(ctx: CanvasRenderingContext2D, digitsX: number, digitTop: number, digitH: number, gap = 0.08, scale = 1, wt = 0): number {
  const H = digitH * scale;
  const base = digitTop + 0.48 * H;
  const s = H / GLYPHS.R.srcH;
  const put = (k: string, x0: number, bottom: number) => {
    const g = GLYPHS[k];
    ctx.save();
    ctx.translate(x0 - g.pad * s, bottom - (g.pad + g.h) * s);
    ctx.scale(s, s);
    fillWeighted(ctx, path(k), wt / s);
    ctx.restore();
    return x0 + g.w * s;
  };
  const left = digitsX - gap * digitH - rpWidth(H);
  let x = put("R", left, base) + 0.08 * H;
  x = put("p", x, base + 0.173 * H) + 0.093 * H;
  put("r.", x, base);
  return left;
}

/** Price with its superscript thousands, as laid out in the slot (scaled by k for a smaller price). */
function groupWidth(slot: TicketSlot, price: number, H: number) {
  const k = H / slot.H;
  const [main, sup] = splitPrice(price);
  return measure(main, H, slot.track) + slot.sup.gap * k + measure(sup, slot.sup.h * k, slot.sup.track);
}

function drawGroup(ctx: CanvasRenderingContext2D, slot: TicketSlot, price: number, x: number, top: number, H: number): number {
  const k = H / slot.H;
  const [main, sup] = splitPrice(price);
  const end = drawStr(ctx, main, x, top + H, H, slot.track, (slot.wt ?? 0) * k);
  const sh = slot.sup.h * k;
  return drawStr(ctx, sup, end + slot.sup.gap * k, top + slot.sup.dy * k + sh, sh, slot.sup.track, (slot.sup.wt ?? 0) * k);
}

/** Erases the design's price and draws `price` (and `strike`, the normal price struck through) in the design's style. */
export function drawSlot(ctx: CanvasRenderingContext2D, slot: TicketSlot, style: StrikeStyle, price: number, strike?: number) {
  ctx.fillStyle = "#fff";
  for (const [ex, ey, ew, eh] of slot.erase) ctx.fillRect(ex, ey, ew, eh);
  ctx.fillStyle = "#000";
  // a longer price than the design's shrinks to stay clear of the next price / the icons (same baseline; the design's "Rp." stays)
  let H = slot.H;
  const w = groupWidth(slot, price, H);
  if (slot.x + w > slot.maxRight) H = (H * (slot.maxRight - slot.x)) / w;
  const top = slot.top + slot.H - H;
  const right = drawGroup(ctx, slot, price, slot.x, top, H);
  if (!strike || strike <= price) return;
  const st = slot.strike ?? style;
  const sH = st.h * slot.H;
  const sTop = slot.top + slot.H + st.dy * slot.H;
  const k = sH / slot.H;
  const sw = groupWidth(slot, strike, slot.H) * k;
  const sx = st.align === "right" ? right + st.dx * slot.H - sw : slot.x + st.dx * slot.H;
  const rpLeft = drawRp(ctx, sx, sTop, sH, st.rpGap, st.rpH, st.rpWt);
  // strike digits in the main price's spacing, scaled down
  const [main, sup] = splitPrice(strike);
  const end = drawStr(ctx, main, sx, sTop + sH, sH, slot.track, st.wt ?? 0);
  const sh = slot.sup.h * k;
  const sRight = drawStr(ctx, sup, end + slot.sup.gap * k, sTop + slot.sup.dy * k + sh, sh, slot.sup.track, st.wt ?? 0);
  const [x0, y0, x1, y1, lw] = st.line;
  ctx.strokeStyle = RED;
  ctx.lineWidth = Math.max(1.2, lw * sH);
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(rpLeft + x0 * sH, sTop + y0 * sH);
  ctx.lineTo(sRight + x1 * sH, sTop + y1 * sH);
  ctx.stroke();
}

/** Fonts of the text slots, the same faces the Apple designs were rendered with: Helvetica → TeX Gyre Heros, Arial → Liberation Sans. */
const FACES = {
  // subset to Latin (digits, "Rp", "/bln", …) as woff2: ~45 KB for all four instead of ~1 MB
  heros: { family: "TicketHeros", regular: "/fonts/texgyreheros-regular.woff2", bold: "/fonts/texgyreheros-bold.woff2" },
  liberation: { family: "TicketLiberation", regular: "/fonts/LiberationSans-Regular.woff2", bold: "/fonts/LiberationSans-Bold.woff2" },
} as const;
let fonts: Promise<void> | null = null;
export function loadTicketFonts(): Promise<void> {
  fonts ??= (async () => {
    const faces = Object.values(FACES).flatMap((f) => [new FontFace(f.family, `url(${f.regular})`, { weight: "400" }), new FontFace(f.family, `url(${f.bold})`, { weight: "700" })]);
    for (const f of await Promise.all(faces.map((x) => x.load()))) document.fonts.add(f);
  })().catch((e) => {
    fonts = null;
    throw new Error(`Font ticket gagal dimuat: ${(e as Error).message}`);
  });
  return fonts;
}

/** Erases the design's text price and writes `value` (+ suffix) in its place, narrowed if it would run into the next text. */
export function drawText(ctx: CanvasRenderingContext2D, slot: TextSlot, value: number) {
  ctx.fillStyle = "#fff";
  for (const [ex, ey, ew, eh] of slot.erase) ctx.fillRect(ex, ey, ew, eh);
  ctx.font = `${slot.bold ? 700 : 400} ${slot.size}px ${FACES[slot.font ?? "heros"].family}`;
  ctx.fillStyle = slot.color;
  ctx.textBaseline = "alphabetic";
  const fam = FACES[slot.font ?? "heros"].family;
  const sfx = slot.suffixSize ?? slot.size;
  const fontOf = (px: number) => `${slot.bold ? 700 : 400} ${px}px ${fam}`;
  const widthOf = (v: number) => {
    ctx.font = fontOf(slot.size);
    const a = ctx.measureText(idNum(v)).width;
    ctx.font = fontOf(sfx);
    return a + (slot.suffix ? ctx.measureText(slot.suffix).width : 0);
  };
  // the design's spacing: printed width / width of the same text in this font
  const ref = widthOf(slot.canva.price);
  const k = ref > 0 ? Math.min(1.15, Math.max(0.85, slot.w / ref)) : 1;
  const w = widthOf(value) * k;
  const room = slot.maxRight - slot.x;
  ctx.save();
  ctx.translate(slot.x, slot.y);
  // a longer number than the room: a little narrower first, then smaller (same baseline)
  const narrow = w > room && room > 0 ? Math.max(0.88, room / w) : 1;
  const fit = w * narrow > room && room > 0 ? room / (w * narrow) : 1;
  ctx.scale(k * narrow * fit, fit);
  ctx.font = fontOf(slot.size);
  const num = idNum(value);
  ctx.fillText(num, 0, 0);
  if (slot.suffix) {
    const nw = ctx.measureText(num).width;
    ctx.font = fontOf(sfx);
    ctx.fillText(slot.suffix, nw, 0);
  }
  ctx.restore();
}

export interface SlotDraw {
  slot: AnySlot;
  price: number;
  strike?: number;
  /** false = keep the design's own pixels (price unchanged). */
  redraw: boolean;
}

/** Full ticket on a canvas `width` px wide (height from the design's aspect). */
/**
 * The store's MAP Club sign-up QR (static: the link itself is encoded, nothing to expire), drawn over the left QR of
 * every Android ticket that has `storeQr`. To change it: replace the PNG (black modules, no quiet zone) and the URL.
 */
export const STORE_QR = { src: "/price-ticket/qr/QF10-mapclub.png", url: "https://www.mapclub.com/en/user/signup?store=QF10" };

/** Paper a ticket prints on (mm): its own `paper`, else the design size. */
export const paperOf = (tpl: Pick<TicketTemplate, "size" | "paper">): [number, number] => tpl.paper ?? tpl.size;

/** The design on the paper (mm): enlarged to fit without distortion, centred. */
export function designOnPaper(tpl: Pick<TicketTemplate, "size" | "paper">) {
  const [pw, ph] = paperOf(tpl);
  const [sw, sh] = tpl.size;
  const k = Math.min(pw / sw, ph / sh);
  return { x: (pw - sw * k) / 2, y: (ph - sh * k) / 2, w: sw * k, h: sh * k, pw, ph };
}

/** Full ticket on its paper: the design is `width` px wide (the canvas is wider/taller when the paper is larger). */
export function drawTicket(canvas: HTMLCanvasElement, img: HTMLImageElement, tpl: TicketTemplate, width: number, slots: SlotDraw[], qr?: HTMLImageElement | null) {
  const [fw, fh] = tpl.frame;
  const height = Math.round((width * fh) / fw);
  const p = designOnPaper(tpl);
  const pxPerMm = width / p.w;
  canvas.width = Math.round(p.pw * pxPerMm);
  canvas.height = Math.round(p.ph * pxPerMm);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(Math.round(p.x * pxPerMm), Math.round(p.y * pxPerMm));
  ctx.drawImage(img, 0, 0, width, height);
  ctx.save();
  ctx.scale(width / fw, height / fh);
  if (tpl.storeQr && qr) {
    const [qx, qy, qs] = tpl.storeQr;
    const pad = qs * 0.04;
    ctx.fillStyle = "#fff";
    ctx.fillRect(qx - pad, qy - pad, qs + pad * 2, qs + pad * 2);
    ctx.imageSmoothingEnabled = false; // crisp modules
    ctx.drawImage(qr, qx, qy, qs, qs);
    ctx.imageSmoothingEnabled = true;
  }
  for (const s of slots) if (s.redraw) (isTextSlot(s.slot) ? drawText(ctx, s.slot, s.price) : drawSlot(ctx, s.slot as TicketSlot, tpl.strikeStyle, s.price, s.strike));
  ctx.restore();
}
