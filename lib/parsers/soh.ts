import type { SohItem } from "@/types/soh";

/** A positioned text run as returned by pdf.js `getTextContent()` (x/y = bottom-left, PDF units). */
export interface PdfText {
  page: number;
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SohParse {
  date: string | null;
  title: string;
  categories: string[];
  items: SohItem[];
  /** Grand Total printed per category (for the qty check). */
  totals: Record<string, number>;
  warnings: string[];
}

interface Block {
  category: string;
  /** Left edge of the block (items at or right of it belong to it). */
  from: number;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const isQty = (s: string) => /^-?\d{1,3}(?:[.,]\d{3})*$|^-?\d+$/.test(s);
const toQty = (s: string) => Number(s.replace(/[.,]/g, ""));

/** `13/10/2026` → `2026-10-13`. */
function toIso(s: string): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), m[3]];
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Groups runs into visual rows (same baseline within ~half a line height). */
function rows(texts: PdfText[]): PdfText[][] {
  const out: PdfText[][] = [];
  const sorted = [...texts].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const t of sorted) {
    const row = out[out.length - 1];
    const tol = Math.max(0.5, (t.h || 1) * 0.45);
    if (row && Math.abs(row[0].y - t.y) <= tol) row.push(t);
    else out.push([t]);
  }
  return out.map((r) => r.sort((a, b) => a.x - b.x));
}

/**
 * Parses the "Stock On Hand" page of the Sales Dashboard V6 PDF: side-by-side blocks
 * (one per category) with the columns Article · Description · Qty and a Grand Total row.
 * Layout is found from the labels (category title above an `Article` header), not fixed positions.
 */
export function parseSohPdf(input: PdfText[]): SohParse {
  const texts = input.map((t) => ({ ...t, str: clean(t.str) })).filter((t) => t.str);
  const warnings: string[] = [];
  const title = texts.filter((t) => t.page === 1).sort((a, b) => b.y - a.y)[0]?.str ?? "";
  const dateRun = texts.find((t) => toIso(t.str));
  const date = dateRun ? toIso(dateRun.str) : null;

  const items: SohItem[] = [];
  const totals: Record<string, number> = {};
  const categories: string[] = [];
  let blocks: Block[] = [];

  for (const page of [...new Set(texts.map((t) => t.page))].sort((a, b) => a - b)) {
    const onPage = texts.filter((t) => t.page === page);
    const headers = onPage.filter((t) => /^article$/i.test(t.str)).sort((a, b) => a.x - b.x);
    let top = Infinity;
    if (headers.length) {
      const headerY = Math.max(...headers.map((h) => h.y));
      const lineH = headers[0].h || 1;
      const qtyHeads = onPage.filter((t) => /^qty$/i.test(t.str) && Math.abs(t.y - headerY) <= lineH).sort((a, b) => a.x - b.x);
      const next: Block[] = [];
      headers.forEach((h, i) => {
        // category title = nearest run above this header, starting between the previous block's Qty and this header
        const left = i ? (qtyHeads.filter((q) => q.x < h.x).pop()?.x ?? headers[i - 1].x) + 1 : -Infinity;
        const right = headers[i + 1]?.x ?? Infinity;
        const label = onPage
          .filter((t) => t.y > headerY + lineH * 0.5 && t.y < headerY + lineH * 6 && t.x >= left && t.x < right && !isQty(t.str) && !toIso(t.str) && !/grand total/i.test(t.str))
          .sort((a, b) => a.y - b.y || a.x - b.x)[0];
        const category = label?.str ?? `Kolom ${i + 1}`;
        next.push({ category, from: Math.min(label?.x ?? h.x, h.x, i ? left : h.x) });
      });
      // block boundary = midpoint between the previous block's Qty column and this block's first column
      for (let i = 1; i < next.length; i++) {
        const prevQty = qtyHeads.filter((q) => q.x < headers[i].x).pop();
        if (prevQty) next[i].from = Math.min(next[i].from, (prevQty.x + prevQty.w + next[i].from) / 2);
      }
      blocks = next;
      top = headerY + lineH * 0.3;
      for (const b of blocks) if (!categories.includes(b.category)) categories.push(b.category);
    }
    if (!blocks.length) continue;

    const body = onPage.filter((t) => t.y < top && !/^(article|description|qty)$/i.test(t.str));
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const end = blocks[i + 1]?.from ?? Infinity;
      for (const row of rows(body.filter((t) => t.x >= b.from && t.x < end))) {
        if (row.some((t) => /grand total/i.test(t.str))) {
          const n = row.filter((t) => isQty(t.str)).pop();
          if (n) totals[b.category] = (totals[b.category] ?? 0) + toQty(n.str);
          continue;
        }
        if (row.length < 2) continue;
        const last = row[row.length - 1];
        if (!isQty(last.str)) continue;
        const [first, ...rest] = row.slice(0, -1);
        // an article code has no spaces; when pdf.js glues code + description, split at the first space
        let article = first.str;
        let description = rest.map((t) => t.str).join(" ");
        if (/\s/.test(article)) {
          const k = article.indexOf(" ");
          description = clean(`${article.slice(k + 1)} ${description}`);
          article = article.slice(0, k);
        }
        items.push({ category: b.category, article, description, qty: toQty(last.str) });
      }
    }
  }

  if (!blocks.length) warnings.push('Header "Article / Description / Qty" tidak ditemukan — bukan PDF Stock On Hand?');
  for (const c of categories) {
    const sum = items.filter((x) => x.category === c).reduce((a, x) => a + x.qty, 0);
    if (totals[c] !== undefined && totals[c] !== sum) warnings.push(`${c}: total artikel ${sum} ≠ Grand Total ${totals[c]}`);
  }
  return { date, title, categories, items, totals, warnings };
}
