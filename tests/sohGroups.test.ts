import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceType, samsungSeries, splitsByType } from "@/lib/domain/sohGroups";

test("soh groups: device type per brand from the description", () => {
  const t = (c: string, d: string) => deviceType(c, d);
  assert.equal(t("Samsung", "GALAXY A07 4/64GB BLACK"), "Phone");
  assert.equal(t("Samsung", "SAMSUNG Z FOLD 8 12/256GB CREAM"), "Phone");
  assert.equal(t("Samsung", "GALAXY TAB S10 LITE 6/128GB WIFI GRAY"), "Tablet");
  assert.equal(t("Samsung", "GALAXY WATCH 9 44MM BLACK"), "Watch");
  assert.equal(t("Samsung", "GALAXY FIT 3 GRAY"), "Watch");
  assert.equal(t("Xiaomi", "REDMI PAD 2 4/128GB GRAY"), "Tablet");
  assert.equal(t("Xiaomi", "XIAOMI SMART BAND 11 ACTIVE BLACK"), "Watch");
  assert.equal(t("Xiaomi", "REDMI NOTE 15 PRO 5G 8/256GB BLACK"), "Phone");
  assert.equal(t("Huawei", "HUAWEI MATEPAD 12X 12/256GB GREEN 2026"), "Tablet");
  assert.equal(t("Huawei", "HUAWEI WATCH FIT 3 BLACK"), "Watch");
  assert.equal(t("Huawei", "HUAWEI WIFI BE3 BLACK"), "Lainnya");
  assert.equal(t("Huawei", "HUAWEI 5G CPE WHITE"), "Lainnya");
  assert.equal(t("Infinix", "INFINIX XPAD 30E 8/128GB BLUE"), "Tablet");
  assert.equal(t("Infinix", "INFINIX SMARTWATCH XW4L BLACK"), "Watch");
  assert.equal(t("Motorola", "MOTOROLA MOTOPAD 60 NEO 8/128GB MALIBU B"), "Tablet");
  assert.equal(t("Oppo", "OPPO FIND N5 FOLD 16/512GB COSMIC BLACK"), "Phone");
  assert.equal(t("Amazfit", "AMAZFIT BIP MAX SILVER BLACK"), "Watch");
  assert.equal(t("SPC", "Finish Good Tablet L80 Wifi"), "Tablet");
  assert.equal(splitsByType("Samsung"), true);
  assert.equal(splitsByType("iPhone"), false);
  assert.equal(splitsByType("Aksesoris"), false);
});

test("soh groups: Samsung series", () => {
  assert.equal(samsungSeries("GALAXY A57 5G 8/128GB DARK BLUE"), "A Series");
  assert.equal(samsungSeries("GALAXY S26 ULTRA 12/256GB BLACK"), "S Series");
  assert.equal(samsungSeries("GALAXY S25 FE 8/256GB NAVY"), "S Series");
  assert.equal(samsungSeries("SAMSUNG Z FLIP 8 12/256GB GRAPHITE"), "Z Series");
  assert.equal(samsungSeries("GALAXY Z FOLD7 12/256GB BLUE"), "Z Series");
  assert.equal(samsungSeries("GALAXY M36 5G 8/128GB"), "M Series");
});
