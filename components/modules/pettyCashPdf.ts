"use client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { PC_ACCOUNTS, dmySlash, numForm, rpForm, shortDate, totals, type PcHeader, type PcRow } from "@/lib/domain/pettyCash";

/** Standard PDF fonts only speak WinAnsi: drop anything else (emoji, CJK …). */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "");

const BLACK = rgb(0, 0, 0);
const GRID = rgb(0.85, 0.85, 0.85);

interface Ctx { page: PDFPage; reg: PDFFont; bold: PDFFont }

/**
 * Page 1: Petty Cash Replenishment Summary (letter landscape), same grid as the QF10 sheet.
 * Signature boxes are left EMPTY on purpose (signed by hand / not signed).
 */
function drawForm(c: Ctx, h: PcHeader, rows: PcRow[], pcrsDate: string) {
  const { page, reg, bold } = c;
  const W = 792, H = 612;
  const X0 = 50, COLS = 11, CW = (W - 2 * X0) / COLS;
  const itemRows = Math.max(15, rows.length);
  const totalRows = 12 + itemRows + 11; // header block + items + footer block
  const RH = Math.min(13, (H - 90) / (totalRows + 0.6));
  const TITLE_H = RH * 1.6;
  const top = H - 45;
  const x = (col: number) => X0 + col * CW;
  // y of the TOP of row r (row 0 = title)
  const yTop = (r: number) => (r === 0 ? top : top - TITLE_H - (r - 1) * RH);
  const fs = Math.min(7.2, RH * 0.56);

  const text = (s: string, col: number, r: number, o: { font?: PDFFont; size?: number; span?: number; align?: "l" | "c" | "r" } = {}) => {
    const font = o.font ?? reg;
    let size = o.size ?? fs;
    const span = o.span ?? 1;
    const maxW = span * CW - 4;
    let str = safe(s);
    while (size > 4.5 && font.widthOfTextAtSize(str, size) > maxW) size -= 0.25;
    if (font.widthOfTextAtSize(str, size) > maxW) {
      while (str.length > 1 && font.widthOfTextAtSize(`${str}..`, size) > maxW) str = str.slice(0, -1);
      str = `${str.trimEnd()}..`;
    }
    const w = font.widthOfTextAtSize(str, size);
    const left = x(col), right = x(col + span);
    const tx = o.align === "r" ? right - 2 - w : o.align === "c" ? (left + right - w) / 2 : left + 2;
    const rowH = r === 0 ? TITLE_H : RH;
    page.drawText(str, { x: tx, y: yTop(r) - rowH / 2 - size * 0.35, size, font });
  };
  const hline = (r: number, c0: number, c1: number, color = BLACK, t = 0.6) => page.drawLine({ start: { x: x(c0), y: yTop(r) }, end: { x: x(c1), y: yTop(r) }, thickness: t, color });
  const vline = (col: number, r0: number, r1: number, color = BLACK, t = 0.6) => page.drawLine({ start: { x: x(col), y: yTop(r0) }, end: { x: x(col), y: yTop(r1) }, thickness: t, color });

  const R_ITEMS = 12; // first item row
  const R_GT = R_ITEMS + itemRows; // Grand Total
  const R_END = R_GT + 10; // bottom line (after Finance Department row)

  // light spreadsheet grid
  // no light vertical line inside merged cells (description, signature boxes, long labels)
  const A0 = R_GT + 1;
  const merged = (col: number, r: number) =>
    (r >= 10 && r < R_GT && col >= 3 && col <= 5) ||
    (r === 6 && col >= 8) ||
    (r >= A0 && ((col === 7 || col === 9) || (col === 5 && r === A0) || (r === A0 && col >= 7))) ||
    (r >= A0 + 5 && r <= A0 + 7 && col >= 1 && col <= 3);
  for (let col = 1; col < COLS; col++) for (let r = 1; r < R_END; r++) if (!merged(col, r)) vline(col, r, r + 1, GRID, 0.3);
  for (let r = 1; r <= R_END; r++) for (let col = 0; col < COLS; col++) if (!(col >= 4 && r >= A0 + 3 && r <= A0 + 7)) hline(r, col, col + 1, GRID, 0.3);

  // title + header
  text("PETTY CASH REPLENISHMENT SUMMARY", 0, 0, { font: bold, size: 11, span: COLS, align: "c" });
  const head: Array<[string, string, number]> = [["Store Name", h.storeName, 2], ["Store Code", h.storeCode, 4], ["Location", h.location, 6]];
  for (const [label, val, r] of head) {
    text(label, 0, r, { font: bold, span: 2 });
    text(":", 2, r, { font: bold });
    text(val, 3, r, { font: bold, span: 4 });
  }
  text("PCRS No", 7, 2, { font: bold });
  text(h.pcrsNo, 8, 2, { font: bold, span: 3 });
  text("Date", 7, 4, { font: bold });
  text(pcrsDate, 8, 4, { font: bold, span: 3 });
  text("Received by Cash Management", 7, 6, { font: bold, span: 4 });
  text("Date :", 7, 8, { font: bold, span: 2 });
  // Received-by box
  hline(6, 7, 11); hline(9, 7, 11); vline(7, 6, 9);

  // item table header
  text("PCV", 1, 10, { font: bold, size: fs * 0.9, align: "c" });
  text("Date", 0, 11, { font: bold, size: fs * 0.9, align: "c" });
  text("No.", 1, 11, { font: bold, size: fs * 0.9, align: "c" });
  text("Description", 2, 11, { font: bold, size: fs * 0.9, span: 4, align: "c" });
  PC_ACCOUNTS.forEach((a, i) => {
    text(a.label, 6 + i, 10, { font: bold, size: fs * 0.9, align: "c" });
    text(a.code, 6 + i, 11, { font: bold, size: fs * 0.9, align: "c" });
  });
  // items
  rows.forEach((row, i) => {
    const r = R_ITEMS + i;
    text(dmySlash(row.date), 0, r, { align: "c" });
    if (row.pcv) text(row.pcv, 1, r, { align: "c" });
    text(row.description, 2, r, { span: 4 });
    const col = 6 + PC_ACCOUNTS.findIndex((a) => a.key === row.account);
    text(rpForm(row.amount), col, r, { align: "r" });
  });
  // item table borders
  hline(10, 0, 11);
  for (let r = R_ITEMS; r <= R_GT; r++) hline(r, 0, 11, BLACK, 0.4);
  for (const col of [0, 1, 2, 6, 7, 8, 9, 10, 11]) vline(col, 10, R_GT);

  // footer
  const t = totals(rows);
  text("Grand Total", 0, R_GT, { font: bold, span: 2 });
  text(":", 2, R_GT, { font: bold });
  text(rpForm(t.grand), 3, R_GT, { font: bold, align: "r" });
  text("Total", 5, R_GT, { font: bold, align: "r" });
  PC_ACCOUNTS.forEach((a, i) => text(rpForm(t.byAccount[a.key]), 6 + i, R_GT, { font: bold, align: "r" }));
  const left: Array<[string, string, boolean]> = [["Payment (Round)", h.paymentRound || "-", false], ["Petty Cash Fund", numForm(h.fund), true], ["PC in proses", h.inProcess || "-", false], ["Sisa Saldo", numForm(h.fund), true]];
  left.forEach(([label, val, right], i) => {
    const r = R_GT + 1 + i;
    text(label, 0, r, { font: bold, span: 2 });
    text(":", 2, r, { font: bold });
    text(val, 3, r, { font: bold, align: right ? "r" : "l" });
  });
  text("Distribution :", 0, R_GT + 6, { font: bold, span: 2 });
  text("1. Original : Attached to PCRS", 0, R_GT + 7, { font: bold, span: 4 });
  text("2. Copy : file", 0, R_GT + 8, { font: bold, span: 2 });

  // approval block (c4..c10), rows R_GT+1 .. R_GT+10
  const A = R_GT + 1;
  text("Cash Management Dept", 4, A, { font: bold, span: 2, align: "c" });
  text("Requestor", 6, A, { font: bold, span: 5, align: "c" });
  text("Checked & Coded", 4, A + 1, { font: bold, align: "c" });
  text("Approved", 5, A + 1, { font: bold, align: "c" });
  text("Prepared by,", 6, A + 1, { font: bold, span: 2, align: "c" });
  text("Approved by,", 8, A + 1, { font: bold, span: 2, align: "c" });
  text("( )", 4, A + 7, { font: bold, align: "c" });
  text("( )", 5, A + 7, { font: bold, align: "c" });
  text(`( ${h.preparedBy || "                    "} )`, 6, A + 7, { font: bold, span: 2, align: "c" });
  text(`( ${h.approvedBy || "                    "} )`, 8, A + 7, { font: bold, span: 2, align: "c" });
  text("Finance Department", 4, A + 8, { font: bold, span: 2, align: "c" });
  text("PIC", 6, A + 8, { font: bold, span: 2, align: "c" });
  text("OIC", 8, A + 8, { font: bold, span: 2, align: "c" });
  for (const r of [A, A + 1, A + 2, A + 7, A + 8, A + 9]) hline(r, 4, 11);
  for (const col of [4, 6, 11]) vline(col, A, A + 9);
  vline(5, A + 1, A + 8);
  for (const col of [8, 10]) vline(col, A + 1, A + 9);
  // left footer boxes
  for (let r = R_GT; r <= A + 4; r++) hline(r, 0, 4, BLACK, 0.4);
  vline(0, R_GT, R_END);
  hline(R_END, 0, 11);
  // outer frame
  page.drawRectangle({ x: x(0), y: yTop(R_END), width: COLS * CW, height: top - yTop(R_END), borderColor: BLACK, borderWidth: 0.8 });
}

export interface PcImage { bytes: Uint8Array; width: number; height: number }

/** Form page + one page per invoice image (in row order). */
export async function buildPettyCashPdf(h: PcHeader, rows: PcRow[], images: PcImage[], title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("Store Dashboard");
  doc.setProducer("Store Dashboard");
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const last = rows.reduce((m, r) => (r.date > m ? r.date : m), "");
  drawForm({ page: doc.addPage([792, 612]), reg, bold }, h, rows, last ? shortDate(last) : "");
  for (const img of images) {
    const jpg = await doc.embedJpg(img.bytes);
    const PW = 560;
    const ph = Math.max(200, (PW * img.height) / img.width);
    const page = doc.addPage([PW + 30, ph + 30]);
    page.drawImage(jpg, { x: 15, y: 15, width: PW, height: ph });
  }
  return doc.save({ useObjectStreams: true });
}
