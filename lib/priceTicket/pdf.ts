/**
 * Minimal PDF writer: JPEG images placed on pages (no dependency). Sizes in millimetres.
 * Each page: width/height + the images on it (x/y from the top-left corner) + optional thin cut lines.
 */
export interface PdfImage {
  jpeg: Uint8Array;
  px: number;
  py: number;
}
export interface PdfPage {
  w: number;
  h: number;
  items: Array<{ img: number; x: number; y: number; w: number; h: number; cut?: boolean }>;
}

const MM = 72 / 25.4;
const enc = new TextEncoder();
const f = (n: number) => (Math.round(n * 1000) / 1000).toString();

/**
 * Crop marks: every cut line (ticket edges) continued as a short solid line in the page margin, outside the
 * tickets, so the line is easy to find and follow with scissors / a cutter even where the dashed edge is faint.
 */
function cropMarks(p: PdfPage, H: number): string {
  const cut = p.items.filter((it) => it.cut);
  if (!cut.length) return "";
  const left = Math.min(...cut.map((it) => it.x));
  const right = Math.max(...cut.map((it) => it.x + it.w));
  const top = Math.min(...cut.map((it) => it.y));
  const bottom = Math.max(...cut.map((it) => it.y + it.h));
  const xs = [...new Set(cut.flatMap((it) => [it.x, it.x + it.w].map((v) => Math.round(v * 100) / 100)))];
  const ys = [...new Set(cut.flatMap((it) => [it.y, it.y + it.h].map((v) => Math.round(v * 100) / 100)))];
  const GAP = 1.5; // mm between the ticket and the mark
  const len = (room: number) => Math.min(8, room - GAP - 1); // mark length (mm), kept on the page
  const line = (x1: number, y1: number, x2: number, y2: number) => `${f(x1 * MM)} ${f(H - y1 * MM)} m ${f(x2 * MM)} ${f(H - y2 * MM)} l S\n`;
  let s = "q 0 G 0.4 w\n";
  const lt = len(top);
  const lb = len(p.h - bottom);
  const ll = len(left);
  const lr = len(p.w - right);
  for (const x of xs) {
    if (lt > 1) s += line(x, top - GAP, x, top - GAP - lt);
    if (lb > 1) s += line(x, bottom + GAP, x, bottom + GAP + lb);
  }
  for (const y of ys) {
    if (ll > 1) s += line(left - GAP, y, left - GAP - ll, y);
    if (lr > 1) s += line(right + GAP, y, right + GAP + lr, y);
  }
  return s + "Q\n";
}

export function buildPdf(images: PdfImage[], pages: PdfPage[], title = "Price Ticket"): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === "string" ? enc.encode(b) : b;
    chunks.push(u);
    pos += u.length;
  };
  // object numbers: 1 catalog, 2 pages, 3 info, images 4.., then page + content pairs
  const imgObj = (i: number) => 4 + i;
  const pageObj = (i: number) => 4 + images.length + i * 2;
  const total = 3 + images.length + pages.length * 2;
  const obj = (n: number, body: string | Array<string | Uint8Array>) => {
    offsets[n] = pos;
    push(`${n} 0 obj\n`);
    for (const b of Array.isArray(body) ? body : [body]) push(b);
    push("\nendobj\n");
  };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  // ask the print dialog for actual size (no "fit to page") — honoured by Acrobat, Chrome and most phone viewers
  obj(1, "<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>");
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  // title as UTF-16BE hex: "Galaxy Tab S12+ (10x16 cm)" keeps its brackets and any non-ASCII letter
  const hex = [...title].map((c) => c.charCodeAt(0).toString(16).padStart(4, "0")).join("");
  obj(3, `<< /Title <FEFF${hex}> /Producer (Store Dashboard) >>`);
  images.forEach((im, i) => obj(imgObj(i), [`<< /Type /XObject /Subtype /Image /Width ${im.px} /Height ${im.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`, im.jpeg, "\nendstream"]));
  pages.forEach((p, i) => {
    const W = p.w * MM;
    const H = p.h * MM;
    let s = "";
    for (const it of p.items) {
      const x = it.x * MM;
      const y = H - (it.y + it.h) * MM;
      s += `q ${f(it.w * MM)} 0 0 ${f(it.h * MM)} ${f(x)} ${f(y)} cm /Im${it.img} Do Q\n`;
      // cutting guide: a thin dashed line on the ticket's edge
      if (it.cut) s += `q 0.55 G 0.35 w [3 2] 0 d ${f(x)} ${f(y)} ${f(it.w * MM)} ${f(it.h * MM)} re S Q\n`;
    }
    s += cropMarks(p, H);
    const used = [...new Set(p.items.map((x) => x.img))];
    obj(pageObj(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] /Resources << /XObject << ${used.map((k) => `/Im${k} ${imgObj(k)} 0 R`).join(" ")} >> >> /Contents ${pageObj(i) + 1} 0 R >>`);
    const body = enc.encode(s);
    obj(pageObj(i) + 1, [`<< /Length ${body.length} >>\nstream\n`, body, "\nendstream"]);
  });
  const xref = pos;
  let x = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= total; n++) x += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(x);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
