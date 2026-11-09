import { GLYPHS } from "@/lib/priceTicket/glyphs";
import { splitPrice } from "@/lib/domain/priceTicket";
import type { StrikeStyle, TicketSlot, TicketTemplate } from "@/types/priceTicket";

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
function drawStr(ctx: CanvasRenderingContext2D, str: string, x: number, baseline: number, H: number, track: number): number {
  [...str].forEach((ch, i) => {
    const g = GLYPHS[ch];
    const s = H / g.srcH;
    if (i) x += (ch === "." || str[i - 1] === "." ? DOT : 1) * track * H;
    ctx.save();
    ctx.translate(x - g.pad * s, baseline - (g.pad + g.h) * s);
    ctx.scale(s, s);
    ctx.fill(path(ch));
    ctx.restore();
    x += g.w * s;
  });
  return x;
}

const rpWidth = (H: number) => {
  const s = H / GLYPHS.R.srcH;
  return GLYPHS.R.w * s + 0.08 * H + GLYPHS.p.w * s + 0.093 * H + GLYPHS["r."].w * s;
};

/** "Rp." ending just left of `digitsX`, baseline 0.48·H under the digit top. Returns its left edge. */
function drawRp(ctx: CanvasRenderingContext2D, digitsX: number, digitTop: number, H: number): number {
  const base = digitTop + 0.48 * H;
  const s = H / GLYPHS.R.srcH;
  const put = (k: string, x0: number, bottom: number) => {
    const g = GLYPHS[k];
    ctx.save();
    ctx.translate(x0 - g.pad * s, bottom - (g.pad + g.h) * s);
    ctx.scale(s, s);
    ctx.fill(path(k));
    ctx.restore();
    return x0 + g.w * s;
  };
  const left = digitsX - 0.08 * H - rpWidth(H);
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
  const end = drawStr(ctx, main, x, top + H, H, slot.track);
  const sh = slot.sup.h * k;
  return drawStr(ctx, sup, end + slot.sup.gap * k, top + slot.sup.dy * k + sh, sh, slot.sup.track);
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
  const rpLeft = drawRp(ctx, sx, sTop, sH);
  // strike digits in the main price's spacing, scaled down
  const [main, sup] = splitPrice(strike);
  const end = drawStr(ctx, main, sx, sTop + sH, sH, slot.track);
  const sh = slot.sup.h * k;
  const sRight = drawStr(ctx, sup, end + slot.sup.gap * k, sTop + slot.sup.dy * k + sh, sh, slot.sup.track);
  const [x0, y0, x1, y1, lw] = st.line;
  ctx.strokeStyle = RED;
  ctx.lineWidth = Math.max(1.2, lw * sH);
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(rpLeft + x0 * sH, sTop + y0 * sH);
  ctx.lineTo(sRight + x1 * sH, sTop + y1 * sH);
  ctx.stroke();
}

export interface SlotDraw {
  slot: TicketSlot;
  price: number;
  strike?: number;
  /** false = keep the design's own pixels (price unchanged). */
  redraw: boolean;
}

/** Full ticket on a canvas `width` px wide (height from the design's aspect). */
export function drawTicket(canvas: HTMLCanvasElement, img: HTMLImageElement, tpl: TicketTemplate, width: number, slots: SlotDraw[]) {
  const [fw, fh] = tpl.frame;
  const height = Math.round((width * fh) / fw);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  ctx.save();
  ctx.scale(width / fw, height / fh);
  for (const s of slots) if (s.redraw) drawSlot(ctx, s.slot, tpl.strikeStyle, s.price, s.strike);
  ctx.restore();
}
