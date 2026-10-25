import { test } from "node:test";
import assert from "node:assert/strict";
import { skuPrices } from "@/lib/domain/skuPrice";
import type { PriceList } from "@/types/pricelist";
import type { SohItem } from "@/types/soh";

test("sku prices: each SOH article points at its price-list model with every storage", () => {
  const list: PriceList = {
    dates: {}, qoala: [], source: {}, updatedAt: {},
    items: [
      { kind: "apple", brand: "iPhone", series: "iPhone 17 Pro", name: "iPhone 17 Pro 256GB", normal: 24999000, promo: 22999000, status: "ACTIVE", articles: ["APPMG8G4ID/A", "APPMG8J4ID/A"] },
      { kind: "apple", brand: "iPhone", series: "iPhone 17 Pro", name: "iPhone 17 Pro 512GB", normal: 29499000, promo: 27499000, status: "ACTIVE", articles: ["APPMG8K4ID/A"] },
      { kind: "android", brand: "Xiaomi", series: "REDMI 17 SERIES", name: "REDMI 17 4/128GB", normal: 2899000, promo: 2799000, status: "ACTIVE", articles: ["XMI2"] },
      { kind: "android", brand: "Xiaomi", series: "REDMI 17 SERIES", name: "REDMI 17 6/128GB", normal: 3299000, promo: 3299000, status: "ACTIVE", articles: ["XMI3"] },
    ],
  };
  const soh = [
    { category: "iPhone", article: "APPMG8J4ID/A", description: "IPHONE 17 PRO 256GB DEEP BLUE", qty: 6 },
    { category: "Xiaomi", article: "xmi3", description: "REDMI 17 6/128GB BLACK", qty: 1 },
    { category: "Aksesoris", article: "AMNA1", description: "AEL CHARGER", qty: 2 },
  ] as SohItem[];
  const r = skuPrices(list, soh);
  assert.equal(r.models.length, 2);
  const [mi, vi] = r.byArticle["APPMG8J4ID/A"];
  assert.equal(r.models[mi].model, "iPhone 17 Pro");
  assert.equal(r.models[mi].kind, "apple");
  assert.deepEqual(r.models[mi].variants.map((v) => v.label), ["256GB", "512GB"]); // all storages, also without stock
  assert.equal(r.models[mi].variants[vi].promo, 22999000);
  const [ai, av] = r.byArticle["XMI3"];
  assert.equal(r.models[ai].variants[av].name, "REDMI 17 6/128GB");
  assert.equal(r.models[ai].variants.length, 2);
  assert.equal(r.byArticle["AMNA1"], undefined); // accessories are not in the price list
  assert.deepEqual(skuPrices(null, soh), { models: [], byArticle: {} });
});
