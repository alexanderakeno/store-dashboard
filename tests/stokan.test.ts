import { test } from "node:test";
import assert from "node:assert/strict";
import { assignItems, assignRecount, finalOf, monitorView, selectItems, tally } from "@/lib/domain/stokan";
import type { SohItem } from "@/types/soh";
import type { StokanEvent, StokanSession } from "@/types/stokan";

const soh: SohItem[] = [
  { category: "Aksesoris", article: "A1", description: "UNIQ CASE 1", qty: 3 },
  { category: "Aksesoris", article: "A2", description: "UNIQ CASE 2", qty: 2 },
  { category: "Aksesoris", article: "B1", description: "APPLE 20W", qty: 10, price: 549000 },
  { category: "AirPods", article: "P1", description: "AIRPODS PRO 3", qty: 4, price: 3999000 },
  { category: "Aksesoris", article: "S1", description: "SAMSUNG CASE", qty: 1 },
  { category: "Aksesoris", article: "Z0", description: "EMPTY", qty: 0 },
  { category: "iPhone", article: "I1", description: "IPHONE", qty: 5, price: 15e6 },
  ...Array.from({ length: 20 }, (_, i) => ({ category: "Aksesoris", article: `R${i}`, description: `RANDOM ${i}`, qty: 1 })),
];
const acc = [
  { article: "A1", brand: "UNIQ", description: "UNIQ CASE 1", category: "Case", srp: 300000, current: 300000, price: 300000 },
  { article: "A2", brand: "UNIQ", description: "UNIQ CASE 2", category: "Case", srp: 300000, current: 300000, price: 300000 },
  { article: "B1", brand: "APPLE", description: "20W", category: "Charger", srp: 549000, current: 499000, price: 549000 },
];

test("rolling stokan picks high value, sold, previous differences + 20% random; full = every accessory in stock", () => {
  const full = selectItems({ soh, acc, sold: new Set(), prevDiff: new Set(), mode: "full", seed: "x" });
  assert.equal(full.length, 25); // no devices, no zero stock
  const r = selectItems({ soh, acc, sold: new Set(["B1"]), prevDiff: new Set(["A2"]), mode: "rolling", seed: "2026-11-10" });
  const reason = Object.fromEntries(r.map((x) => [x.article, x.reason]));
  assert.equal(reason.P1, "value");
  assert.equal(reason.B1, "sold");
  assert.equal(reason.A2, "diff");
  assert.equal(r.filter((x) => x.reason === "random").length, Math.round(22 * 0.2));
  // same seed → same pick
  assert.deepEqual(selectItems({ soh, acc, sold: new Set(["B1"]), prevDiff: new Set(["A2"]), mode: "rolling", seed: "2026-11-10" }).map((x) => x.article), r.map((x) => x.article));
});

test("articles are split by brand, balanced, and rotate between sessions", () => {
  const items = selectItems({ soh, acc, sold: new Set(), prevDiff: new Set(), mode: "full", seed: "x" });
  const staff = [{ nik: "1", name: "Chelsy" }, { nik: "2", name: "Elvina" }];
  const a = assignItems(items, staff, 0);
  const load = (x: typeof a, n: string) => x.filter((i) => i.assignee === n).length;
  assert.ok(Math.abs(load(a, "1") - load(a, "2")) <= 13);
  assert.equal(new Set(a.filter((x) => x.brand === "UNIQ").map((x) => x.assignee)).size, 1); // a brand stays together
  const b = assignItems(items, staff, 1);
  assert.notEqual(a.find((x) => x.article === "A1")!.assignee, b.find((x) => x.article === "A1")!.assignee);
});

const ev = (p: Partial<StokanEvent>): StokanEvent => ({ id: Math.random().toString(36), ts: "2026-11-10T02:00:00.000Z", nik: "1", name: "Chelsy", article: "A1", kind: "add", value: 1, phase: "count", ...p });

test("tally: adds, typed set, duplicate ids once, recount wins, extras", () => {
  const e = [
    ev({ id: "a", ts: "2026-11-10T02:00:00Z" }),
    ev({ id: "a", ts: "2026-11-10T02:00:00Z" }), // retried upload
    ev({ id: "b", ts: "2026-11-10T02:01:00Z" }),
    ev({ id: "c", ts: "2026-11-10T02:02:00Z", kind: "set", value: 5 }),
    ev({ id: "d", ts: "2026-11-10T02:03:00Z" }),
    ev({ id: "e", ts: "2026-11-10T03:00:00Z", article: "B1", nik: "2", value: 9 }),
    ev({ id: "f", ts: "2026-11-10T04:00:00Z", article: "B1", nik: "1", kind: "set", value: 10, phase: "recount" }),
    ev({ id: "g", ts: "2026-11-10T04:00:00Z", article: "", code: "6971234500017", kind: "extra" }),
  ];
  const t = tally(e);
  assert.equal(t.counts.get("A1")!.count, 6);
  assert.equal(finalOf(t, "B1"), 10);
  assert.equal(finalOf(t, "ZZ"), 0);
  assert.equal(t.extras.get("6971234500017")!.times, 1);
});

test("recount goes to another staff; monitor shows differences, confirmed vs resolved, accuracy", () => {
  const staff = [{ nik: "1", name: "Chelsy" }, { nik: "2", name: "Elvina" }];
  const items = [
    { article: "A1", description: "UNIQ 1", brand: "UNIQ", category: "Case", expected: 3, price: 300000, assignee: "1", reason: "full" as const },
    { article: "A2", description: "UNIQ 2", brand: "UNIQ", category: "Case", expected: 2, price: 300000, assignee: "1", reason: "full" as const },
    { article: "B1", description: "20W", brand: "APPLE", category: "Charger", expected: 10, price: 549000, assignee: "2", reason: "full" as const },
  ];
  const count = [ev({ id: "1", article: "A1", value: 3 }), ev({ id: "2", article: "A2", value: 1 }), ev({ id: "3", article: "B1", nik: "2", value: 8 })];
  const s: StokanSession = { id: "s", label: "W2", mode: "full", status: "count", startedAt: "", startedBy: "", sohDate: null, sohUpdatedAt: "", staff };
  const v1 = monitorView(s, items, count, new Date("2026-11-10T02:05:00Z"));
  assert.deepEqual([v1.counted, v1.matched, v1.diff], [3, 1, 2]);
  const re = assignRecount(items, tally(count), staff);
  assert.equal(re.find((x) => x.article === "A2")!.recount, "2");
  assert.equal(re.find((x) => x.article === "B1")!.recount, "1");
  assert.equal(re.find((x) => x.article === "A1")!.recount, undefined);
  const after = [...count, ev({ id: "4", article: "A2", nik: "2", value: 2, phase: "recount", ts: "2026-11-10T03:00:00Z" }), ev({ id: "5", article: "B1", nik: "1", value: 9, phase: "recount", ts: "2026-11-10T03:01:00Z" })];
  const v2 = monitorView({ ...s, status: "recount" }, re, after, new Date("2026-11-10T03:05:00Z"));
  assert.equal(v2.matched, 2); // A1 + A2 (resolved by the recount)
  assert.equal(v2.confirmed, 1); // B1 still −1 after two people
  assert.equal(v2.diffValue, -549000);
  assert.equal(v2.staff.find((x) => x.nik === "1")!.accuracy, 50); // A1 right, A2 wrong
  assert.equal(v2.staff.find((x) => x.nik === "2")!.accuracy, 0);
});

test("articles nobody checked are not differences; 'Selesai bagian' turns the not-found ones into 0", () => {
  const staff = [{ nik: "1", name: "Chelsy" }, { nik: "2", name: "Elvina" }];
  const items = [
    { article: "A1", description: "1", brand: "UNIQ", category: "Case", expected: 3, price: 1, assignee: "1", reason: "full" as const },
    { article: "A2", description: "2", brand: "UNIQ", category: "Case", expected: 2, price: 1, assignee: "1", reason: "full" as const },
    { article: "B1", description: "3", brand: "APPLE", category: "Charger", expected: 4, price: 1, assignee: "2", reason: "full" as const },
  ];
  const s: StokanSession = { id: "s", label: "W2", mode: "full", status: "count", startedAt: "", startedBy: "", sohDate: null, sohUpdatedAt: "", staff };
  const e = [ev({ id: "1", article: "A1", value: 3 }), ev({ id: "2", article: "", kind: "done" })];
  const v = monitorView(s, items, e, new Date());
  assert.deepEqual([v.unchecked, v.diff, v.matched], [1, 1, 1]); // A2 not found by Chelsy (done) = −2 · B1 untouched
  const re = assignRecount(items, tally(e), staff);
  assert.deepEqual(re.filter((x) => x.recount).map((x) => x.article), ["A2"]);
});
