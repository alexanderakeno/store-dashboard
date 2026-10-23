/** id-ID display formatting. Pure — usable in server and client components. */
const nf0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const num = (n: number | null | undefined) => (n == null ? "–" : nf0.format(n));
export const dec = (n: number | null | undefined, d: 1 | 2 = 2) => (n == null ? "–" : (d === 1 ? nf1 : nf2).format(n));
export const rp = (n: number | null | undefined) => (n == null ? "–" : `${n < 0 ? "-" : ""}Rp${nf0.format(Math.abs(Math.round(n)))}`);

/** Compact rupiah: Rp4,65 M · Rp751,2 jt · Rp349 rb */
export function rpc(n: number | null | undefined): string {
  if (n == null) return "–";
  const a = Math.abs(n);
  const s = n < 0 ? "-\u2060" : ""; // word joiner: the minus never wraps away from "Rp"
  if (a >= 1e12) return `${s}Rp${nf2.format(a / 1e12)}\u00a0T`;
  if (a >= 1e9) return `${s}Rp${nf2.format(a / 1e9)}\u00a0M`;
  if (a >= 1e6) return `${s}Rp${nf1.format(a / 1e6)}\u00a0jt`;
  if (a >= 1e3) return `${s}Rp${nf0.format(a / 1e3)}\u00a0rb`;
  return `${s}Rp${nf0.format(a)}`;
}

export const pct = (n: number | null | undefined, d: 0 | 1 = 1) =>
  n == null || !Number.isFinite(n) ? "–" : `${d ? nf1.format(n) : nf0.format(n)}%`;

const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const dayShort = (d: string) => `${DAYS[new Date(d + "T00:00:00Z").getUTCDay()]} ${Number(d.slice(8, 10))}`;
export const dateLong = (d: string) =>
  `${DAYS[new Date(d + "T00:00:00Z").getUTCDay()]}, ${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

/** Tone for an achievement %, used by badges/progress (icon + label always accompany it). */
export function tone(p: number | null | undefined): "good" | "warn" | "bad" | "none" {
  if (p == null) return "none";
  if (p >= 100) return "good";
  if (p >= 85) return "warn";
  return "bad";
}

/** Full rupiah with a space, reference style: "Rp 3.913.258.501" · "-Rp 12.000". */
export const rpf = (n: number | null | undefined) => (n == null ? "–" : `${n < 0 ? "-\u2060" : ""}Rp\u00a0${nf0.format(Math.abs(Math.round(n)))}`);

/** Signed percentage with a triangle: "▲ 12,5%" / "▼ 3,0%". */
export const pctArrow = (n: number | null | undefined, d: 0 | 1 = 1) => (n == null || !Number.isFinite(n) ? "–" : `${n >= 0 ? "▲" : "▼"} ${pct(Math.abs(n), d)}`);

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "10 Okt 2026" */
export const dateShort = (d: string) => `${d.slice(8, 10)} ${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
/** "Okt 2026" */
export const monthShort = (m: string) => `${MONTHS_SHORT[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
/** "Jumat" */
export const dayName = (d: string) => DAY_NAMES[new Date(d + "T00:00:00Z").getUTCDay()];
/** "02/10/2026" */
export const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
