/** Normalization of spreadsheet values (id-ID formats, Sheets serials, messy text). */

const ID_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7,
  agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

/** Parse a number that may be a Sheets number or an id-ID formatted string. */
export function parseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  let s = String(value).trim();
  if (!s || s === "-" || /^#/.test(s)) return 0; // empty, dash, #REF!/#DIV/0!
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1).trim(); }
  s = s.replace(/^rp\.?\s*/i, "").replace(/\s/g, "");
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  if (s.endsWith("%")) s = s.slice(0, -1);
  // id-ID: "." thousands, "," decimal. A lone "," with 1-3 trailing digits is a decimal.
  if (/,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Google Sheets serial date (days since 1899-12-30) → ISO date. */
export function serialToISO(serial: number): string {
  const ms = Math.round(serial) * 86400000 + Date.UTC(1899, 11, 30);
  const dt = new Date(ms);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Parse dates found in the sheets:
 * `02-09-2026` (DD-MM-YYYY), `9/1/2026` (M/D/YYYY, CX tracker), `1/Sep/26`, `1/Okt/26`,
 * `2026-09-01`, or a Sheets serial number. Returns null when unparseable.
 */
export function parseDate(value: unknown, opts: { slashOrder?: "MDY" | "DMY" } = {}): string | null {
  if (typeof value === "number") return value > 20000 && value < 80000 ? serialToISO(value) : null;
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\/\s-]([A-Za-z]{3,})[\/\s-](\d{2,4})$/);
  if (m) {
    const mon = ID_MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!mon) return null;
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valid(y, mon, +m[1]);
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    const order = opts.slashOrder ?? (a > 12 ? "DMY" : "MDY");
    return order === "MDY" ? valid(+m[3], a, b) : valid(+m[3], b, a);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
  return null;
}

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return iso(y, m, d);
}

/** Invoice numbers arrive as `100010628`, `100.010.628,00` or numbers. */
export function normalizeInvoice(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return String(Math.round(value));
  const s = String(value).trim();
  if (!s) return "";
  if (/^[\d.,\s]+$/.test(s)) return String(Math.round(parseNumber(s)));
  return s.toUpperCase();
}

export function normalizeText(value: unknown): string {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

export function normalizeKey(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

/** Staff name key: case/space-insensitive, used to match name variants. */
export function nameKey(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
}

/** Title-case a name for display ("ADI MUHAMAD" → "Adi Muhamad"). */
export function displayName(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

/** `"APPMD3J4ZA/A / 20W USB-C POWER ADAPTER"` → article + description. */
export function splitProduct(value: unknown): { article: string; description: string } {
  const s = normalizeText(value);
  const i = s.indexOf(" / ");
  if (i < 0) return { article: s.toUpperCase(), description: "" };
  return { article: s.slice(0, i).trim().toUpperCase(), description: s.slice(i + 3).trim() };
}

/** NIK like `24002735`; null for blanks. */
export function normalizeNik(value: unknown): string | null {
  if (value == null) return null;
  const s = typeof value === "number" ? String(Math.round(value)) : String(value).trim();
  const digits = s.replace(/\D/g, "");
  return digits.length >= 4 ? digits : null;
}
