"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps every table inside `.sd-table-wrap` within the screen width, so nothing needs sideways
 * scrolling:
 * 1. a table that fits is left alone;
 * 2. one that is too wide first tries a compact style (`sd-fit-compact`: smaller text/padding,
 *    wrapping headers);
 * 3. if it still doesn't fit, every row becomes a card (`sd-fit-stack`) where each value is shown
 *    under its column name (`data-label`, taken from the header — multi-row headers are joined,
 *    e.g. "Apple · iPhone").
 * Re-checked on navigation, resize and when the page content changes.
 */
export function TableFit() {
  const path = usePathname();
  const sp = useSearchParams();
  const query = sp.toString();

  useEffect(() => {
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => document.querySelectorAll<HTMLElement>(".sd-table-wrap").forEach(fit));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(document.body);
    // streamed / client-updated content (filters, popups) adds tables after the first pass
    const mo = new MutationObserver((list) => {
      if (list.some((m) => [...m.addedNodes].some((n) => n instanceof HTMLElement && (n.matches(".sd-table-wrap, table, tr") || n.querySelector?.(".sd-table-wrap"))))) run();
    });
    const main = document.querySelector("main") ?? document.body;
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
    };
  }, [path, query]);

  return null;
}

function fit(wrap: HTMLElement) {
  const table = wrap.querySelector<HTMLTableElement>(":scope > table");
  if (!table || wrap.offsetParent === null) return; // hidden (e.g. desktop table on a phone)
  wrap.classList.remove("sd-fit-compact", "sd-fit-stack");
  if (table.scrollWidth <= wrap.clientWidth + 1) return;
  wrap.classList.add("sd-fit-compact");
  if (table.scrollWidth <= wrap.clientWidth + 1) return;
  wrap.classList.remove("sd-fit-compact");
  label(table);
  wrap.classList.add("sd-fit-stack", "sd-fit-measure");
  wrap.style.setProperty("--fit-col", `${columnWidth(table)}px`);
  wrap.classList.remove("sd-fit-measure");
}

/**
 * Card column width for the stacked layout: wide enough for the widest value (measured unwrapped),
 * so short values (qty, %) sit 3–4 per line and rupiah amounts 2 per line — no broken numbers, and
 * far shorter cards than a fixed width.
 */
function columnWidth(table: HTMLTableElement): number {
  let max = 0;
  const range = document.createRange();
  for (const td of table.querySelectorAll<HTMLElement>("tbody td:not(:first-child), tfoot td:not(:first-child)")) {
    // form controls (inputs, "Isi Reason" editors…) size themselves to the column — don't let them widen it
    if (td.dataset.fitWide || td.dataset.fitHide || !td.textContent?.trim() || td.querySelector("input, textarea, select, button, [popover]")) continue;
    range.selectNodeContents(td);
    max = Math.max(max, range.getBoundingClientRect().width);
  }
  return Math.round(Math.min(170, Math.max(64, max + 6)));
}

/** Column labels from the header (handles colspan/rowspan), copied onto every body/foot cell. */
function label(table: HTMLTableElement) {
  if (table.dataset.fitLabels === "1") return;
  const head = table.tHead ? [...table.tHead.rows] : [];
  const grid: string[][] = [];
  head.forEach((tr, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of [...tr.cells]) {
      while (grid[r][c] !== undefined) c++;
      const text = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
      for (let dr = 0; dr < cell.rowSpan; dr++)
        for (let dc = 0; dc < cell.colSpan; dc++) {
          grid[r + dr] ??= [];
          grid[r + dr][c + dc] = text;
        }
      c += cell.colSpan;
    }
  });
  const width = Math.max(0, ...grid.map((g) => g.length));
  // columns whose header asks for it (`data-fit-hide`) are dropped from the cards — details that
  // stay available elsewhere (e.g. a popup per row)
  const hidden = new Set<number>();
  head.forEach((tr) => {
    let c = 0;
    for (const cell of [...tr.cells]) {
      if (cell.dataset.fitHide) for (let dc = 0; dc < cell.colSpan; dc++) hidden.add(c + dc);
      c += cell.colSpan;
    }
  });
  const labels = Array.from({ length: width }, (_, c) => {
    const parts: string[] = [];
    for (const g of grid) {
      const t = g[c];
      if (t && parts[parts.length - 1] !== t) parts.push(t);
    }
    return parts.join(" · ");
  });
  const rows = [...table.tBodies].flatMap((b) => [...b.rows]).concat(table.tFoot ? [...table.tFoot.rows] : []);
  for (const tr of rows) {
    let c = 0;
    for (const cell of [...tr.cells]) {
      if (cell.colSpan > 1 && cell.colSpan >= width - 1) cell.dataset.fitWide = "1"; // section / note rows
      if (!cell.dataset.label) cell.dataset.label = labels[c] ?? "";
      if (hidden.has(c) && cell.colSpan === 1) cell.dataset.fitHide = "1";
      c += cell.colSpan;
    }
  }
  table.dataset.fitLabels = "1";
}
