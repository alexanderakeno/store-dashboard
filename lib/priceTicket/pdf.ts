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
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  obj(3, `<< /Title (${title.replace(/[()\\]/g, "")}) /Producer (Store Dashboard) >>`);
  images.forEach((im, i) => obj(imgObj(i), [`<< /Type /XObject /Subtype /Image /Width ${im.px} /Height ${im.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`, im.jpeg, "\nendstream"]));
  pages.forEach((p, i) => {
    const W = p.w * MM;
    const H = p.h * MM;
    let s = "";
    for (const it of p.items) {
      const x = it.x * MM;
      const y = H - (it.y + it.h) * MM;
      s += `q ${f(it.w * MM)} 0 0 ${f(it.h * MM)} ${f(x)} ${f(y)} cm /Im${it.img} Do Q\n`;
      if (it.cut) s += `q 0.75 G 0.3 w ${f(x)} ${f(y)} ${f(it.w * MM)} ${f(it.h * MM)} re S Q\n`;
    }
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
