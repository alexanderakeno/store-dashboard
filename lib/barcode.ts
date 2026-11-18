/**
 * Linear barcodes for the screen (SOH "Barcode"): EAN-13 / UPC-A for retail codes, Code 128 for anything else
 * (article codes like "APPMTP43ID/A"). Returns the bar pattern as modules ("1" = bar), drawn as SVG by the caller.
 */

/** Code 128 symbols 0–106 (106 = stop, 13 modules). */
const C128 = "11011001100 11001101100 11001100110 10010011000 10010001100 10001001100 10011001000 10011000100 10001100100 11001001000 11001000100 11000100100 10110011100 10011011100 10011001110 10111001100 10011101100 10011100110 11001110010 11001011100 11001001110 11011100100 11001110100 11101101110 11101001100 11100101100 11100100110 11101100100 11100110100 11100110010 11011011000 11011000110 11000110110 10100011000 10001011000 10001000110 10110001000 10001101000 10001100010 11010001000 11000101000 11000100010 10110111000 10110001110 10001101110 10111011000 10111000110 10001110110 11101110110 11010001110 11000101110 11011101000 11011100010 11011101110 11101011000 11101000110 11100010110 11101101000 11101100010 11100011010 11101111010 11001000010 11110001010 10100110000 10100001100 10010110000 10010000110 10000101100 10000100110 10110010000 10110000100 10011010000 10011000010 10000110100 10000110010 11000010010 11001010000 11110111010 11000010100 10001111010 10100111100 10010111100 10010011110 10111100100 10011110100 10011110010 11110100100 11110010100 11110010010 11011011110 11011110110 11110110110 10101111000 10100011110 10001011110 10111101000 10111100010 11110101000 11110100010 10111011110 10111101110 11101011110 11110101110 11010000100 11010010000 11010011100 1100011101011".split(" ");
const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_R = EAN_L.map((p) => [...p].map((b) => (b === "1" ? "0" : "1")).join(""));
const EAN_G = EAN_R.map((p) => [...p].reverse().join(""));
/** Parity of the left six digits, by the first digit. */
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export interface Barcode {
  format: "EAN-13" | "UPC-A" | "Code 128";
  /** Modules left to right ("1" = bar), without quiet zones. */
  bits: string;
  /** Human readable text under the bars. */
  text: string;
  /** Long guard bars (EAN / UPC): module ranges [from, to) drawn taller. */
  guards: Array<[number, number]>;
}

/** Check digit of an EAN / UPC body (all digits but the last). */
export function eanCheck(body: string): number {
  let s = 0;
  for (let i = 0; i < body.length; i++) s += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (s % 10)) % 10;
}
const validEan = (d: string) => /^\d+$/.test(d) && eanCheck(d.slice(0, -1)) === Number(d[d.length - 1]);

function ean13(d: string, format: "EAN-13" | "UPC-A"): Barcode {
  const par = EAN_PARITY[Number(d[0])];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === "L" ? EAN_L : EAN_G)[Number(d[i])];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += EAN_R[Number(d[i])];
  bits += "101";
  return { format, bits, text: format === "UPC-A" ? d.slice(1) : d, guards: [[0, 3], [45, 50], [92, 95]] };
}

export function code128(value: string): Barcode {
  const v = value.replace(/[^\x20-\x7E]/g, "");
  const allDigits = /^\d+$/.test(v) && v.length >= 4 && v.length % 2 === 0;
  const codes: number[] = [];
  if (allDigits) {
    codes.push(START_C);
    for (let i = 0; i < v.length; i += 2) codes.push(Number(v.slice(i, i + 2)));
  } else {
    codes.push(START_B);
    // long digit runs packed as Code C pairs (shorter bars, easier to scan)
    let i = 0;
    let set: "B" | "C" = "B";
    while (i < v.length) {
      const run = v.slice(i).match(/^\d+/)?.[0] ?? "";
      if (run.length >= 6) {
        const n = run.length - (run.length % 2);
        if (set !== "C") codes.push(CODE_C), (set = "C");
        for (let k = 0; k < n; k += 2) codes.push(Number(run.slice(k, k + 2)));
        i += n;
        continue;
      }
      if (set !== "B") codes.push(CODE_B), (set = "B");
      codes.push(v.charCodeAt(i) - 32);
      i++;
    }
  }
  const check = codes.reduce((a, c, i) => a + c * (i === 0 ? 1 : i), 0) % 103;
  const bits = [...codes, check, 106].map((c) => C128[c]).join("");
  return { format: "Code 128", bits, text: v, guards: [] };
}

/** EAN-13 for 13 valid digits, UPC-A for 12 (drawn as EAN-13 with a leading 0), else Code 128. */
export function barcodeOf(value: string): Barcode {
  const v = value.trim();
  if (/^\d{13}$/.test(v) && validEan(v)) return ean13(v, "EAN-13");
  if (/^\d{12}$/.test(v) && validEan(v)) return ean13(`0${v}`, "UPC-A");
  return code128(v);
}
