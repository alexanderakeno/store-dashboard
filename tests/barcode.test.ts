import { test } from "node:test";
import assert from "node:assert/strict";
import { barcodeOf, code128, eanCheck } from "../lib/barcode";
import { packSohRows, unpackSohRows } from "../lib/domain/soh";

test("barcode: EAN-13 / UPC-A when the check digit is right, else Code 128", () => {
  assert.equal(eanCheck("880609546790"), 0);
  const e = barcodeOf("8806095467900");
  assert.deepEqual([e.format, e.bits.length, e.bits.slice(0, 3), e.bits.slice(45, 50), e.bits.slice(-3)], ["EAN-13", 95, "101", "01010", "101"]);
  const u = barcodeOf("194253714385");
  assert.deepEqual([u.format, u.text, u.bits.length], ["UPC-A", "194253714385", 95]);
  // a wrong check digit is not forced into EAN: Code 128 keeps every digit as printed
  assert.equal(barcodeOf("8806095467901").format, "Code 128");
  const c = code128("APPMTP43ID/A");
  // start B, 12 characters, check, stop (13 modules)
  assert.equal(c.bits.length, 11 * 14 + 13);
  assert.ok(c.bits.startsWith("11010010000"));
  assert.ok(c.bits.endsWith("1100011101011"));
  // digits only (even): code set C pairs
  assert.equal(code128("123456").bits.length, 11 * 5 + 13);
});

test("soh rows keep their barcodes through pack / unpack", () => {
  const rows = [
    { category: "iPhone", article: "A1", description: "X", qty: 2, sold: 1, coverDays: 30, balance: "ok" as const, barcodes: ["194253714385", "194253714392"] },
    { category: "iPhone", article: "A2", description: "Y", qty: 1, sold: 0, coverDays: null, balance: "unsold" as const },
  ];
  const back = unpackSohRows(packSohRows(rows, ["iPhone"]), ["iPhone"]);
  assert.deepEqual(back[0].barcodes, ["194253714385", "194253714392"]);
  assert.equal(back[1].barcodes, undefined);
});
