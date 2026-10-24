import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRanges, parseSamsungPromo, promoCode, type SheetGrid } from "@/lib/parsers/samsungPromo";
import { bestCash, exclusions, promoState, variantPromo } from "@/lib/domain/samsungPromo";

test("parseRanges: single, weekend pairs, cross-month, missing year, 0KTOBER typo", () => {
  assert.deepEqual(parseRanges("16 - 31 OKTOBER 2026", 2026), [{ from: "2026-10-16", to: "2026-10-31" }]);
  assert.deepEqual(parseRanges("TGL 23-25 OKTOBER, & TGL 30 OKTOBER - 1 NOVEMBER 2026", 2025), [
    { from: "2026-10-23", to: "2026-10-25" },
    { from: "2026-10-30", to: "2026-11-01" },
  ]);
  assert.deepEqual(parseRanges("16 SEPTEMBER - 31 DESEMBER 2026", 2026), [{ from: "2026-09-16", to: "2026-12-31" }]);
  assert.deepEqual(parseRanges("HANYA 3 HARI TGL 23 - 25 0KTOBER", 2026), [{ from: "2026-10-23", to: "2026-10-25" }]);
  assert.deepEqual(parseRanges("berlaku seterusnya", 2026), []);
});

test("promoCode: code after the last colon or alone", () => {
  assert.equal(promoCode("KODE PROMO MOP SSC UNTUK PWP S26 : PWPS26BASE"), "PWPS26BASE");
  assert.equal(promoCode("Menggunakan MOP SSC kode Promo : PWPA300"), "PWPA300");
  assert.equal(promoCode("TR26FE2000"), "TR26FE2000");
});

const list: SheetGrid = {
  name: "List Promo Samsung",
  rows: [
    ["NO.", "JENIS PROMO", "NAMA PROMO", "MEKANISME", "PERIODE PROMO", "KETENTUAN PENGGABUNGAN PROMO"],
    [1, "PWP", "PHONE X", "MOP SSC, KODE PROMO : PWPX500 = untuk Phone X", "16 - 31 OKTOBER 2026", "PWP + TRADE IN DAPAT DIGABUNGKAN"],
    [2, "TRADE IN", "PHONE X", "MOP SSC, KODE PROMO : TRX1000 = untuk Phone X 128GB", "1 - 31 OKTOBER 2026", null],
    [3, "ADDITIONAL / TAMBAHAN TRADE IN", "PHONE X", "KODE PROMO : TRADDX500", "23-25 OKTOBER 2026", "APABILA CUSTOMER MEMILIH PROMO INI MAKA CUSTOMER TIDAK BISA MENDAPATKAN BENEFIT PROMO EIP"],
    [4, "EIP", "PHONE X", "KODE PROMO : EIPX700", "16 - 31 OKTOBER 2026", null],
    [5, "PWP", "TAB Z Khusus di Store QA05 Saja", "KODE PROMO : PWPTABZ", "1 - 31 OKTOBER 2026", null],
  ],
};
const sheets: SheetGrid[] = [
  list,
  {
    name: "PWP Phone X",
    rows: [
      ["PROMO PWP PHONE X :"],
      ["1. Periode Promo = Tgl 16 - 31 Oktober 2026."],
      [null, "Article", "Description", "Promo PWP - MOP SSC", "Kode Promo PWP MOP SSC"],
      [null, "SSUSM-X100AXID", "GALAXY X 8/128GB BLACK", 500000, "PWPX500"],
      [null, "SSUSM-X100BXID", "GALAXY X 8/128GB WHITE", null, null],
      ["SYARAT DAN KETENTUAN :"],
      [null, null, "Kode Artikel", "Description"],
      [null, null, "SSUEP-T2510NBEGWW", "TRAVEL ADAPTER 25W"],
      [null, null, "SSUSM-R410NZKAXSE", "GALAXY BUDS CORE BLACK"],
    ],
  },
  {
    name: "Trade In Phone X",
    rows: [
      ["Artikel Device Tablet", "Description Artikel Tablet", "KODE PROMO MOP SSC (SSC-SSU Cashback)", "NILAI CASHBACK TRADE IN"],
      ["SSUSM-X100AXID", "GALAXY X 8/128GB BLACK", "TRX1200", 1200000],
      ["SSUSM-X100BXID", "GALAXY X 8/128GB WHITE", null, null],
    ],
  },
  { name: "Add Trade In X", rows: [["Artikel", "Description", "KODE PROMO MOP SSC", "NILAI Tambahan CASHBACK TRADE IN"], ["SSUSM-X100AXID", "GALAXY X 8/128GB BLACK", "TRADDX500", 500000]] },
  { name: "EIP X", rows: [["Article", "Description", "Cashback EIP MOP SSC", "Kode MOP SSC"], ["SSUSM-X100AXID", "GALAXY X 8/128GB BLACK", 700000, "EIPX700"]] },
  { name: "PWP Tab Z", rows: [["Promo Tab Z :"], ["1. Periode Promo = 1 - 31 Oktober 2026, kode PWPTABZ"], ["Digiplus Article", "Description"], ["SSUSM-Z900XID", "GALAXY TAB Z 12/256GB GRAY"]] },
];

test("parseSamsungPromo: detail sheets give values/codes (carry-forward), pairs, notes, periods, store limits, warnings", () => {
  const r = parseSamsungPromo(sheets, { title: "List Promo Aktif Samsung Oktober 2026" });
  assert.equal(r.programs.length, 5);
  assert.deepEqual(r.programs[4].stores, ["QA05"]);
  const pwp = r.articles.filter((a) => a.sheet === "PWP Phone X");
  assert.deepEqual(pwp.map((a) => [a.article, a.value, a.code, a.kind]), [["SSUSM-X100AXID", 500000, "PWPX500", "PWP"], ["SSUSM-X100BXID", 500000, "PWPX500", "PWP"]]);
  assert.deepEqual(pwp[0].ranges, [{ from: "2026-10-16", to: "2026-10-31" }]);
  assert.deepEqual(r.pairs.map((p) => p.article), ["SSUEP-T2510NBEGWW", "SSUSM-R410NZKAXSE"]);
  const ti = r.articles.filter((a) => a.kind === "TRADE IN");
  assert.deepEqual(ti.map((a) => [a.value, a.code]), [[1200000, "TRX1200"], [1200000, "TRX1200"]]);
  // the summary's TRX1000 is not used by any detail sheet → warning, detail value wins
  assert.ok(r.warnings.some((w) => w.includes("TRX1000")));
  // a sheet with only an article list → info rows of its program (store-limited)
  const tab = r.articles.find((a) => a.sheet === "PWP Tab Z");
  assert.deepEqual([tab?.value, tab?.stores], [0, ["QA05"]]);
  assert.ok(r.sheets.find((s) => s.name === "PWP Phone X")?.notes.some((n) => n.startsWith("SYARAT")));
});

test("exclusions + bestCash + variantPromo: EIP excludes extra trade in, PWP kept apart, other stores hidden", () => {
  const r = { ...parseSamsungPromo(sheets, { title: "2026" }), source: "", updatedAt: "", updatedBy: "" };
  const excl = exclusions(r.programs);
  assert.ok(excl.some(([a, b]) => (a === "EIP" && b === "TAMBAHAN TRADE IN") || (a === "TAMBAHAN TRADE IN" && b === "EIP")));
  const v = variantPromo("GALAXY X 8/128GB", r, "2026-10-24", "QF10", excl)!;
  assert.deepEqual(v.items.map((i) => i.kind), ["PWP", "TRADE IN", "TAMBAHAN TRADE IN", "EIP"]);
  // trade in 1,2 jt + EIP 700 rb (1,9 jt) beats trade in + extra trade in (1,7 jt)
  assert.deepEqual(v.cash, { total: 1_900_000, kinds: ["TRADE IN", "EIP"] });
  assert.equal(v.pwp, 500_000);
  // after the weekend the extra trade in is over
  const later = variantPromo("GALAXY X 8/128GB", r, "2026-10-28", "QF10", excl)!;
  assert.ok(!later.items.some((i) => i.kind === "TAMBAHAN TRADE IN"));
  assert.equal(promoState([{ from: "2026-10-30", to: "2026-11-01" }], "2026-10-24"), "akan");
  assert.deepEqual(bestCash([], excl), { total: 0, kinds: [] });
  // the store-limited tab promo is info only (no value) → listed as info, not hidden
  assert.deepEqual(variantPromo("GALAXY TAB Z 12/256GB", r, "2026-10-24", "QF10", excl)?.info, ["PWP Tab Z"]);
  assert.equal(variantPromo("GALAXY Y 8/128GB", r, "2026-10-24", "QF10", excl), null);
});
