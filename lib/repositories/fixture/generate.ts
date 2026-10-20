/**
 * Deterministic SYNTHETIC month generator for local development (DATA_SOURCE=fixture).
 * Placeholder staff, made-up articles and prices. Produces grids with the same
 * layout as the real `Control MR &SP` / `Target Store` tabs so the real parsers run.
 */
import type { Grid } from "@/lib/parsers/controlSheet";
import { daysInMonth, eachDay, monthStart } from "@/lib/domain/period";
import type { ISODate, MonthKey } from "@/types/domain";

interface Article {
  code: string;
  desc: string;
  type: string;
  brand: string;
  category: string;
  price: number;
  weight: number;
}

const ARTICLES: Article[] = [
  { code: "SYN-IP-01", desc: "IPHONE DEMO 128GB", type: "DEVICES", brand: "APPLE", category: "PHONE", price: 16_999_000, weight: 7 },
  { code: "SYN-IP-02", desc: "IPHONE DEMO PRO 256GB", type: "DEVICES", brand: "APPLE", category: "PHONE", price: 24_999_000, weight: 5 },
  { code: "SYN-IPD-01", desc: "IPAD DEMO 11 WIFI", type: "DEVICES", brand: "APPLE", category: "TABLETS", price: 7_499_000, weight: 2 },
  { code: "SYN-MAC-01", desc: "MACBOOK DEMO 13", type: "DEVICES", brand: "APPLE", category: "LAPTOPS", price: 18_999_000, weight: 1 },
  { code: "SYN-AW-01", desc: "APPLE WATCH DEMO 42MM", type: "DEVICES", brand: "APPLE", category: "WATCH", price: 6_499_000, weight: 1 },
  { code: "SYN-AP-01", desc: "AIRPODS DEMO", type: "ACCESSORIES", brand: "APPLE", category: "EARPHONES", price: 2_499_000, weight: 3 },
  { code: "SYN-ADP-01", desc: "20W USB-C ADAPTER DEMO", type: "ACCESSORIES", brand: "APPLE", category: "POWER", price: 349_000, weight: 4 },
  { code: "SYN-SS-01", desc: "GALAXY DEMO A", type: "DEVICES", brand: "SAMSUNG", category: "PHONE", price: 4_299_000, weight: 4 },
  { code: "SYN-SS-02", desc: "GALAXY DEMO S", type: "DEVICES", brand: "SAMSUNG", category: "PHONE", price: 13_999_000, weight: 2 },
  { code: "SYN-SW-01", desc: "GALAXY WATCH DEMO", type: "DEVICES", brand: "SAMSUNG", category: "WATCH", price: 3_199_000, weight: 1 },
  { code: "SYN-OP-01", desc: "OPPO DEMO RENO", type: "DEVICES", brand: "OPPO", category: "PHONE", price: 5_999_000, weight: 2 },
  { code: "SYN-XI-01", desc: "XIAOMI DEMO NOTE", type: "DEVICES", brand: "XIAOMI", category: "PHONE", price: 2_999_000, weight: 3 },
  { code: "SYN-CS-01", desc: "CASE DEMO CLEAR", type: "ACCESSORIES", brand: "MICROPACK", category: "CASE", price: 299_000, weight: 6 },
  { code: "SYN-SG-01", desc: "SCREEN GUARD DEMO", type: "ACCESSORIES", brand: "IBACKS", category: "SCREEN PROTECTOR", price: 199_000, weight: 6 },
  { code: "SYN-CB-01", desc: "CABLE DEMO 1M", type: "ACCESSORIES", brand: "RAPTIC", category: "CABLE", price: 149_000, weight: 3 },
  { code: "SYN-PB-01", desc: "POWERBANK DEMO", type: "ACCESSORIES", brand: "MEDPOIN", category: "POWER", price: 399_000, weight: 2 },
  { code: "SYN-QO-01", desc: "PROTEKSI DEMO 1 TAHUN", type: "ACCESSORIES", brand: "KOALA", category: "PROTECTION", price: 699_000, weight: 4 },
  { code: "SYN-TS-01", desc: "PAKET DATA DEMO", type: "ACCESSORIES", brand: "TELKOMSEL", category: "VOUCHER", price: 100_000, weight: 2 },
  { code: "SYN-BLD-01", desc: "BLENDER DEMO", type: "MOTORIZED", brand: "MUTURAL", category: "HOME", price: 499_000, weight: 1 },
];
const BAG: Article = { code: "SYN-BAG", desc: "PAPER BAG DEMO", type: "SUPPORTING", brand: "NON MD DEMO", category: "OTHER", price: 0, weight: 0 };

export const FIXTURE_STAFF = [
  { nik: "90000001", name: "STAFF ALFA" },
  { nik: "90000002", name: "STAFF BRAVO" },
  { nik: "90000003", name: "STAFF CHARLIE" },
  { nik: "90000004", name: "STAFF DELTA" },
  { nik: "90000005", name: "STAFF ECHO" },
];

/** mulberry32 — tiny seeded PRNG so every reload produces the same month. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ddmmyyyy = (d: ISODate) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
const ID_MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const shortDate = (d: ISODate) => `${Number(d.slice(8, 10))}/${ID_MON[Number(d.slice(5, 7)) - 1]}/${d.slice(2, 4)}`;

function pick<T extends { weight: number }>(r: () => number, items: T[]): T {
  const total = items.reduce((a, i) => a + i.weight, 0);
  let x = r() * total;
  for (const i of items) if ((x -= i.weight) < 0) return i;
  return items[items.length - 1];
}

interface SpRow { date: ISODate; nik: string; name: string; art: Article; invoice: string; amount: number }

export function generateMonth(month: MonthKey, lastDay: ISODate): { control: Grid; target: Grid } {
  const seed = Number(month.replace("-", ""));
  const r = rng(seed);
  const days = lastDay < monthStart(month) ? [] : eachDay(monthStart(month), lastDay).filter((d) => d.startsWith(month));
  const sp: SpRow[] = [];
  let inv = 100_000_000 + (seed % 1000) * 10_000;

  for (const day of days) {
    const weekend = [0, 6].includes(new Date(day + "T00:00:00Z").getUTCDay());
    const nInv = Math.round((weekend ? 16 : 10) + r() * 6);
    for (let i = 0; i < nInv; i++) {
      inv++;
      const online = r() < 0.06;
      const staff = FIXTURE_STAFF[Math.floor(r() * FIXTURE_STAFF.length)];
      const who = online ? { nik: "", name: "Mapemall" } : staff;
      const items = 1 + Math.floor(r() * r() * 4);
      for (let k = 0; k < items; k++) {
        const art = pick(r, ARTICLES);
        const qty = art.type === "ACCESSORIES" && r() < 0.15 ? 2 : 1;
        sp.push({ date: day, nik: who.nik, name: who.name, art, invoice: String(inv), amount: art.price * qty });
      }
      if (r() < 0.35) sp.push({ date: day, nik: who.nik, name: who.name, art: BAG, invoice: String(inv), amount: 0 });
    }
  }

  // Merchandise Report = SP aggregated per day + article (qty, net)
  const mrMap = new Map<string, { date: ISODate; art: Article; qty: number; net: number }>();
  for (const s of sp) {
    const key = `${s.date}|${s.art.code}`;
    const e = mrMap.get(key) ?? { date: s.date, art: s.art, qty: 0, net: 0 };
    e.qty += s.art.price ? s.amount / s.art.price : 1;
    e.net += s.amount;
    mrMap.set(key, e);
  }
  const mr = [...mrMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const dailyMap = new Map<ISODate, number>();
  for (const s of sp) dailyMap.set(s.date, (dailyMap.get(s.date) ?? 0) + s.amount);

  const blank = (n: number) => Array.from({ length: n }, () => "" as string | number);
  const rowOf = (daily: Array<string | number>, mrCells: Array<string | number>, spCells: Array<string | number>) => [
    "", ...[...daily, ...blank(4)].slice(0, 4), "", ...[...mrCells, ...blank(9)].slice(0, 9), "", ...[...spCells, ...blank(9)].slice(0, 9),
  ];

  const control: Grid = [
    rowOf(["Daily Control"], ["Merchandise Report"], ["Sales Person"]),
    rowOf(["Date", "MR", "SP", "Difference"], ["Brand Name", "Product Division", "Product Group", "Product Category", "Date", "Product Code", "Qty", "Discount", "Net Sales"], ["Date", "NIK", "Sales Name", "Product Code", "Invoice", "Amount", "Type", "Brand", "Details"]),
  ];
  const dailyRows = [...dailyMap.entries()];
  const n = Math.max(mr.length, sp.length, dailyRows.length);
  for (let i = 0; i < n; i++) {
    const d = dailyRows[i];
    const m = mr[i];
    const s = sp[i];
    control.push(
      rowOf(
        d ? [shortDate(d[0]), d[1], d[1], 0] : [],
        m ? [m.art.brand, "DEMO DIVISION", m.art.type, m.art.category, ddmmyyyy(m.date), `${m.art.code} / ${m.art.desc}`, m.qty, 0, m.net] : [],
        s ? [ddmmyyyy(s.date), s.nik, s.name, `${s.art.code} / ${s.art.desc}`, s.invoice, s.amount, s.art.type, s.art.brand, s.art.category] : [],
      ),
    );
  }

  // Target: close to the generated run-rate (≈ 90–110% achievement), split like a real store
  const dim = daysInMonth(month);
  const base = 4_600_000_000 * (dim / 30) * (0.95 + r() * 0.15);
  const g = { Apple: base * 0.75, Android: base * 0.19, ACC: base * 0.05, VAS: base * 0.01 };
  const share = [0.24, 0.22, 0.2, 0.18, 0.16];
  const fmt = (x: number) => Math.round(x);
  const section = (title: string, total: number, cols: Array<[string, number]>) => {
    const rows: Grid = [
      ["", title],
      ["", "Target (%)", "", ...cols.map(([, p]) => `${Math.round(p * 100)}%`), "100%"],
      ["", "Target (IDR)", "", ...cols.map(([, p]) => fmt(total * p)), fmt(total)],
      ["", "Name", "Target", ...cols.map(([c]) => c), "Total"],
    ];
    FIXTURE_STAFF.forEach((s, i) => rows.push(["", s.name, `${share[i] * 100}%`, ...cols.map(([, p]) => fmt(total * p * share[i])), fmt(total * share[i])]));
    rows.push(["", "Total", "100%", ...cols.map(([, p]) => fmt(total * p)), fmt(total)], []);
    return rows;
  };
  const target: Grid = [
    ["", "SYNTHETIC"],
    ["", "Target Store"],
    ["", "Total Target", "Apple", "Android", "Accessories", "VAS"],
    ["", fmt(base), fmt(g.Apple), fmt(g.Android), fmt(g.ACC), fmt(g.VAS)],
    [],
    ...section("Apple", g.Apple, [["iPhone", 0.74], ["iPad", 0.1], ["Mac", 0.1], ["Apple Watch", 0.06]]),
    ...section("Android", g.Android, [["Samsung", 0.6], ["Oppo", 0.2], ["Xiaomi", 0.2]]),
    ...section("Accessories", g.ACC, [["Dino", 0.3], ["iBack", 0.2], ["IGA", 0.1], ["Medpoin", 0.1], ["Mutual", 0.05], ["Kaizen", 0.05], ["Apple", 0.2]]),
    ...section("VAS", g.VAS, [["Qoala", 0.8], ["Telkomsel", 0.2]]),
  ];
  return { control, target };
}

/** Synthetic `CX&GR Tracker` and `Rekap Promo` grids (same layout as the real tabs). */
export function generateExtras(month: MonthKey, lastDay: ISODate): { tracker: Grid; promo: Grid; accFocus: Grid } {
  const r = rng(Number(month.replace("-", "")) + 7);
  const names = FIXTURE_STAFF.map((s) => s.name.split(" ")[1].charAt(0) + s.name.split(" ")[1].slice(1).toLowerCase());
  const days = lastDay < monthStart(month) ? [] : eachDay(monthStart(month), lastDay).filter((d) => d.startsWith(month));
  const mdy = (d: ISODate) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}/${d.slice(0, 4)}`;
  const block = () => days.map((d) => {
    const vals = names.map(() => (r() < 0.3 ? 1 + Math.floor(r() * 2) : ""));
    const total = vals.reduce<number>((a, v) => a + (Number(v) || 0), 0);
    return [mdy(d), "Hari", ...vals, total || "", 10 + Math.floor(r() * 10)];
  });
  const cx = block();
  const gr = block();
  const width = names.length + 4;
  const tracker: Grid = [
    ["CX", ...Array(width).fill(""), "GR"],
    ["Customer Experience", ...Array(width).fill(""), "Google Review"],
    [],
    [...["Date", "Day", ...names, "Total CX", "Total Invoice"], "", ...["Date", "Day", ...names, "Total GR", "Total Invoice"]],
    ...cx.map((row, i) => [...row, "", ...gr[i]]),
    ["Total"],
  ];
  const promo: Grid = [
    ["UNIVERSAL", "", "Apple", "", "Samsung", ""],
    ["Promo", "Keterangan", "Promo", "Keterangan", "Promo", "Keterangan"],
    ["BNPL 0% Demo", "Min 5 jt", "iPhone Demo", "Free adapter", "Galaxy Demo", "Cashback 500rb"],
    ["", "", "", "selama persediaan ada", "Trade In Demo", "Up to 1 jt"],
  ];
  // "Data - Akeno" ACC Fokus leaderboard: a few suppliers, QTY | AMOUNT | INSENTIF each, then TOTAL
  const sup = ["SUPPLIER DEMO A", "SUPPLIER DEMO B", "APPLE ACC"];
  const accRows = FIXTURE_STAFF.map((s, i) => {
    const cells = sup.flatMap((): Array<string | number> => {
      const q = Math.floor(r() * 8);
      return q ? [q, q * (150_000 + Math.floor(r() * 300_000)), q * 7_500] : ["-", "-", "-"];
    });
    const num = (k: number) => cells.filter((_, j) => j % 3 === k).reduce<number>((a, v) => a + (Number(v) || 0), 0);
    return ["", i + 1, displayCase(s.name), ...cells, num(0), num(1), num(2)];
  });
  const accFocus: Grid = [
    ["", `LEADERBOARD ACC FOKUS - MTD ${Number(lastDay.slice(8, 10))}/${lastDay.slice(5, 7)}/${lastDay.slice(2, 4)}`],
    ["", "", "ACC FOKUS", ...sup.flatMap((x) => [x, "", ""]), "TOTAL", "", ""],
    ["", "RANK", "SALES NAME", ...[...sup, "TOTAL"].flatMap(() => ["QTY", "AMOUNT", "INSENTIF"])],
    ...accRows,
    ["", "TOTAL"],
  ];
  return { tracker, promo, accFocus };
}

const displayCase = (s: string) => s.toLowerCase().replace(/(^|\s)([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
