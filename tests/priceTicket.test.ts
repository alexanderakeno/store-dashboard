import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSlot, splitPrice } from "../lib/domain/priceTicket";
import { buildPdf } from "../lib/priceTicket/pdf";
import { TICKET_TEMPLATES } from "../lib/priceTicket/templates";
import { APPLE_TEMPLATES } from "../lib/priceTicket/apple";
import { monthly } from "../lib/domain/priceTicket";
import { isTextSlot, type TextSlot } from "../types/priceTicket";
import { matchRow, nameTokens } from "../lib/domain/priceTicket";
import { GLYPHS } from "../lib/priceTicket/glyphs";
import type { PriceItem } from "../types/pricelist";
import type { TicketSlot } from "../types/priceTicket";

const row = (name: string, normal: number, promo = normal): PriceItem => ({ kind: "android", brand: "Xiaomi", series: "", name, normal, promo, status: "ACTIVE" });
const slot = (key: string, price: number, strike?: number, strikeRoom = true): TicketSlot => ({ key, label: "", canva: { price, ...(strike ? { strike } : {}) }, x: 100, top: 100, H: 50, track: 0.1, sup: { gap: 3, dy: -5, h: 30, track: 0.1 }, erase: [[40, 90, 300, 70]], maxRight: 560, strikeRoom });

test("same price as the design → keep the design", () => {
  const r = resolveSlot(slot("REDMI 15C 6/128GB", 2349000), [row("REDMI 15C 6/128GB", 2349000)]);
  assert.equal(r.status, "same");
  assert.equal(r.price, 2349000);
  assert.equal(r.strike, undefined);
});

test("promo → promo price with the normal price struck", () => {
  const r = resolveSlot(slot("XIAOMI 17 ULTRA 16/512GB", 16999000, 19999000), [row("Xiaomi 17 Ultra  16/512GB", 19999000, 17999000)]);
  assert.deepEqual([r.status, r.price, r.strike], ["updated", 17999000, 19999000]);
});

test("design promo ended → normal price, no strike", () => {
  const r = resolveSlot(slot("REDMI PAD 2 4/128GB", 2999000, 3299000), [row("REDMI PAD 2 4/128GB", 3299000)]);
  assert.deepEqual([r.status, r.price, r.strike], ["updated", 3299000, undefined]);
});

test("several rows with the same name → the one with the design's normal price", () => {
  const r = resolveSlot(slot("XIAOMI WATCH 5", 5559000), [row("XIAOMI WATCH 5", 4999000), row("XIAOMI WATCH 5", 5559000, 4299000)]);
  assert.deepEqual([r.price, r.strike], [4299000, 5559000]);
});

test("not in the price list → design price, flagged", () => {
  const r = resolveSlot(slot("REDMI NOTE 17 PRO 5G 6/256GB", 5299000, 2699000), [row("REDMI NOTE 17 PRO 5G 8/256GB", 5999000, 5799000)]);
  assert.deepEqual([r.status, r.price, r.strike], ["missing", 5299000, 2699000]);
});

test("promo without room for a strike → promo only, normal price reported", () => {
  const r = resolveSlot(slot("REDMI NOTE 17 6/128GB", 3999000, undefined, false), [row("REDMI NOTE 17 6/128GB", 3999000, 3799000)]);
  assert.deepEqual([r.price, r.strike, r.strikeDropped], [3799000, undefined, 3999000]);
});

test("splitPrice", () => {
  assert.deepEqual(splitPrice(4299000), ["4.299", ".000"]);
  assert.deepEqual(splitPrice(369000), ["369", ".000"]);
  assert.deepEqual(splitPrice(20999500), ["20.999", ".500"]);
});

test("templates: slots inside the frame, glyphs for every digit", () => {
  assert.equal(TICKET_TEMPLATES.filter((t) => t.brand === "Xiaomi").length, 10);
  assert.equal(new Set(TICKET_TEMPLATES.map((t) => t.id)).size, TICKET_TEMPLATES.length);
  for (const t of [...TICKET_TEMPLATES, ...APPLE_TEMPLATES]) {
    assert.ok(t.slots.length > 0, t.id);
    assert.ok(Math.abs(t.frame[0] / t.frame[1] - t.size[0] / t.size[1]) < 0.03, `${t.id} aspect`);
    for (const s of t.slots) {
      assert.ok(s.erase.length > 0, `${t.id} ${s.key}`);
      for (const [x, y, w, h] of s.erase) assert.ok(x >= -3 && y >= -3 && x + w <= t.frame[0] + 3 && y + h <= t.frame[1] + 3, `${t.id} ${s.key}`);
      if (isTextSlot(s)) assert.ok(s.x > 0 && s.x < s.maxRight && s.size > 10 && s.y < t.frame[1], `${t.id} ${s.key}`);
      else assert.ok(s.x > 0 && s.x < s.maxRight && s.H > 10 && s.sup.h > 5, `${t.id} ${s.key}`);
    }
  }
  for (const ch of "0123456789.") assert.ok(GLYPHS[ch]?.d, ch);
});

test("pdf: valid header, xref offsets point at objects", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = buildPdf([{ jpeg, px: 1, py: 1 }, { jpeg, px: 1, py: 1 }], [{ w: 210, h: 297, items: [{ img: 0, x: 5, y: 48.5, w: 100, h: 100, cut: true }, { img: 1, x: 105, y: 48.5, w: 100, h: 100, cut: true }] }]);
  const s = new TextDecoder("latin1").decode(pdf);
  assert.ok(s.startsWith("%PDF-1.4"));
  assert.ok(s.trimEnd().endsWith("%%EOF"));
  const bytes = Buffer.from(pdf);
  const xref = Number(/startxref\n(\d+)/.exec(s)![1]);
  assert.equal(bytes.subarray(xref, xref + 4).toString(), "xref");
  const offs = [...bytes.subarray(xref).toString("latin1").matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(offs.length, 7);
  offs.forEach((o, i) => assert.equal(bytes.subarray(o, o + 10).toString("latin1").split(" ")[0], String(i + 1)));
  assert.match(s, /\/MediaBox \[0 0 595\.276 841\.89\]/);
});

test("name matching: variants, RAM+ext RAM, model words", () => {
  assert.deepEqual(nameTokens("Galaxy A57 5G 8+8/128GB"), ["A57", "5G", "8/128"]);
  assert.deepEqual(nameTokens("Galaxy Tab S12 Plus 12/256GB Wi-Fi"), ["TAB", "S12+", "12/256", "WIFI"]);
  assert.deepEqual(nameTokens("OPPO A6s 8GB + 128GB"), ["A6S", "8/128"]);
  assert.deepEqual(nameTokens("GALAXY TAB S12+ 12/256GB WIFI"), nameTokens("GALAXY TAB S12 PLUS WIFI 12GB/256GB").sort((a, b) => ["TAB", "S12+", "12/256", "WIFI"].indexOf(a) - ["TAB", "S12+", "12/256", "WIFI"].indexOf(b)));
  const rows = [row("HUAWEI WATCH GT 7 PRO 46MM", 5499000, 4999000), row("HUAWEI WATCH GT 7 46MM", 4399000, 3899000), row("REDMI NOTE 17 5G 6/128GB", 4599000)];
  assert.equal(matchRow({ key: "WATCH GT 7", canva: { price: 3899000 } }, rows)?.name, "HUAWEI WATCH GT 7 46MM");
  assert.equal(matchRow({ key: "WATCH GT 7 PRO", canva: { price: 4999000 } }, rows)?.name, "HUAWEI WATCH GT 7 PRO 46MM");
  assert.equal(matchRow({ key: "REDMI NOTE 17 6/128GB", canva: { price: 3999000 } }, rows), null);
  assert.equal(matchRow({ key: "GALAXY A57 5G 8+8/128GB", canva: { price: 1 } }, [row("SAMSUNG GALAXY A57 5G 8/128GB", 8499000)])?.normal, 8499000);
});

test("apple: monthly = price / 24 rounded down, matched in the Apple list only", () => {
  assert.equal(monthly(17499000), 729125);
  assert.equal(monthly(22249000), 927041);
  const apple = (name: string, normal: number, promo = normal) => ({ ...row(name, normal, promo), kind: "apple" as const });
  const items = [apple("iPhone 17 256GB", 20499000), apple("iPhone 17 Pro 256GB", 24999000, 22999000), row("iPhone 17 256GB", 1)];
  const t = (field: "price" | "monthly", price: number): TextSlot => ({ type: "text", key: "iPhone 17 256GB", label: "256GB", field, canva: { price }, x: 10, y: 10, size: 20, bold: false, color: "#000", suffix: "", w: 50, erase: [], maxRight: 100, strikeRoom: false });
  assert.deepEqual([resolveSlot(t("price", 17499000), items, "apple").price, resolveSlot(t("monthly", 729125), items, "apple").price], [20499000, 854125]);
  assert.equal(resolveSlot(t("monthly", 854125), items, "apple").status, "same");
  const cell = [apple("11-INCH IPAD WI-FI 128GB", 9499000, 8699000), apple("11-INCH IPAD WI-FI + CELLULAR 128GB", 12499000, 11699000)];
  assert.equal(matchRow({ key: "11-INCH IPAD WI-FI 128GB", canva: { price: 1 } }, cell, "apple")?.promo, 8699000);
  assert.equal(matchRow({ key: "11-INCH IPAD WI-FI + CELLULAR 128GB", canva: { price: 1 } }, cell, "apple")?.promo, 11699000);
});

test("apple: MacBook Neo is matched on its price list name (MBN)", () => {
  const items = [{ ...row("MBN 13/8GB/256GB", 13499000, 12999000), kind: "apple" as const }, { ...row("MBN 13/8GB/512GB", 15749000, 15249000), kind: "apple" as const }];
  const neo = APPLE_TEMPLATES.find((t) => t.name === "MacBook Neo")!;
  for (const s of neo.slots) assert.notEqual(resolveSlot(s, items, "apple").status, "missing", s.key);
});
