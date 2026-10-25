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

test("seriesOf: Galaxy Z / S / A vs Tab S / Tab A, Watch, Buds", async () => {
  const { seriesOf } = await import("@/lib/domain/samsungPromo");
  assert.deepEqual(seriesOf(["Z FLIP 8, Z FOLD 8"]), ["Galaxy Z"]);
  assert.deepEqual(seriesOf(["S26FE 5G"]), ["Galaxy S"]);
  assert.deepEqual(seriesOf(["TAB S10 FE 5G & TAB S10 LITE"]), ["Tab S"]);
  assert.deepEqual(seriesOf(["TAB A11 & TAB A11 PLUS SERIES"]), ["Tab A"]);
  assert.deepEqual(seriesOf(["A07 - A07 5G SERIES & A17"]), ["Galaxy A"]);
  assert.deepEqual(seriesOf(["Watch 6 Classic, A26 5G, TAB A9, TAB S10 PLUS, BUDS 3"]), ["Galaxy A", "Tab S", "Tab A", "Watch", "Buds"]);
  assert.deepEqual(seriesOf(["PROMO LAIN"]), []);
});

test("variantPromo: two values of one kind for one price row are labelled by what differs", () => {
  const promo = {
    title: "", programs: [], pairs: [], sheets: [], warnings: [], source: "", updatedAt: "", updatedBy: "",
    articles: [
      { sheet: "PWP TAB", kind: "PWP" as const, article: "SSUSM-X133NZAAXID", description: "GALAXY TAB A11 4/64GB GRAY WIFI", value: 300000, code: "PWPTAB300", normal: null, ranges: [], stores: [] },
      { sheet: "PWP TAB", kind: "PWP" as const, article: "SSUSM-X135GZAAXID", description: "GALAXY TAB A11 4/64GB GRAY", value: 899000, code: "PWPTAB899", normal: null, ranges: [], stores: [] },
    ],
  };
  const v = variantPromo("GALAXY TAB A11 4/64G", promo, "2026-10-24", "QF10")!;
  assert.deepEqual(v.items.map((i) => [i.code, i.label]), [["PWPTAB899", "tanpa WIFI"], ["PWPTAB300", "WIFI"]]);
});

test("etpPromos: model + storage named in ETP cashback programs", async () => {
  const { etpPromos, modelKeys } = await import("@/lib/domain/samsungPromo");
  const prog = (no: number, type: string, name: string, extra: Partial<{ stores: string[]; ranges: Array<{ from: string; to: string }> }> = {}) =>
    ({ no, type, name, mechanism: "BR di ETP", period: "", ranges: [{ from: "2026-10-01", to: "2026-10-31" }], combine: "", stores: [], codes: [], ...extra });
  const programs = [
    prog(16, "CASHBACK di ETP", "S26 ULTRA 16/1TB"),
    prog(17, "CASHBACK di ETP", "S26 - S26 PLUS - S26 ULTRA 12/256GB - S26 ULTRA 12/512GB"),
    prog(6, "CASHBACK", "TAB S10 FE 5G & TAB S10 FE PLUS 5G"),
    prog(8, "CASHBACK", "A07 - A07 5G SERIES & A17 - A17 5G SERIES"),
    prog(29, "CASHBACK", "S25 - S25 ULTRA", { ranges: [{ from: "2026-10-01", to: "2026-10-15" }] }),
    prog(28, "CASHBACK di ETP", "WATCH 9 & WATCH ULTRA 2", { stores: ["QA05"] }),
  ];
  const nos = (n: string) => etpPromos(n, programs, "2026-10-24", "QF10").map((p) => p.no);
  assert.deepEqual([...modelKeys("S26 ULTRA 12/256GB - S26 ULTRA 12/512GB").get("S26ULTRA")!.storages], ["12/256GB", "12/512GB"]);
  assert.deepEqual(nos("GALAXY S26 ULTRA 16/1TB"), [16]);
  assert.deepEqual(nos("GALAXY S26 ULTRA 12/256GB"), [17]);
  assert.deepEqual(nos("GALAXY S26 12/512GB"), [17]);
  assert.deepEqual(nos("GALAXY S26 FE 8/256GB"), []);
  assert.deepEqual(nos("GALAXY TAB S10 FE PLUS 5G 12/256G"), [6]);
  assert.deepEqual(nos("GALAXY TAB S10 FE WIFI 8/128G"), []); // the program names the 5G models
  assert.deepEqual(etpPromos("GALAXY TAB S11 5G ULTRA 12/256G", [prog(13, "CASHBACK", "TAB S11 5G")], "2026-10-24", "QF10"), []);
  assert.deepEqual(etpPromos("GALAXY TAB S11 5G 12/256G", [prog(13, "CASHBACK", "TAB S11 5G")], "2026-10-24", "QF10").map((p) => p.no), [13]);
  assert.deepEqual(nos("GALAXY A17 5G 8/256GB"), [8]);
  assert.deepEqual(nos("GALAXY S25 ULTRA 12/256GB"), []); // ended 15 Oct
  assert.deepEqual(nos("GALAXY WATCH 9 44MM"), []); // other stores only
});

test("variantPromo: Excel rows match promo articles by code (\"GALAXY Z FOLD 8\" row vs SAP \"SAMSUNG Z FOLD 8\")", () => {
  const art = (article: string, description: string, value: number, code: string) => ({ sheet: "PWP FOLD", kind: "PWP" as const, article, description, value, code, normal: null, ranges: [], stores: [] });
  const promo = {
    title: "", programs: [], pairs: [], sheets: [], warnings: [], source: "", updatedAt: "", updatedBy: "",
    articles: [art("SSUSM-F971BZWDXID", "SAMSUNG Z FOLD 8 12/256GB CREAM", 1699000, "PWPFOLD8"), art("SSUSM-F971BZKDXID", "SAMSUNG Z FOLD 8 12/256GB GRAPHITE", 1699000, "PWPFOLD8"), art("SSUSM-F776BZKAXID", "SAMSUNG Z FLIP 8 12/256GB GRAPHITE", 1099000, "PWPFLIP8")],
  };
  // by name alone the row does not match the SAP description…
  assert.equal(variantPromo("GALAXY Z FOLD 8 12/256GB", promo, "2026-10-25", "QF10"), null);
  // …with its articles it does
  const v = variantPromo("GALAXY Z FOLD 8 12/256GB", promo, "2026-10-25", "QF10", undefined, ["SSUSM-F971BZWDXID", "SSUSM-F971BZKDXID"])!;
  assert.deepEqual(v.items.map((i) => [i.code, i.value, i.label]), [["PWPFOLD8", 1699000, ""]]);
  assert.equal(v.pwp, 1699000);
  // articles that are not in any promo → name fallback (PDF-style name still works)
  assert.equal(variantPromo("SAMSUNG Z FLIP 8 12/256GB", promo, "2026-10-25", "QF10", undefined, ["OTHER"])?.pwp, 1099000);
});
