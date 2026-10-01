/**
 * Synthetic test fixture shaped like the `Control MR &SP` and `Target Store` tabs.
 * Placeholder staff and made-up numbers — for unit tests only, never production.
 */
import type { Grid } from "@/lib/parsers/controlSheet";

const blank = (n: number) => Array.from({ length: n }, () => "");

function row(daily: string[], mr: string[], sp: string[]): string[] {
  // A | B..E daily | F | G..O MR | P | Q..Y SP
  return ["", ...pad(daily, 4), "", ...pad(mr, 9), "", ...pad(sp, 9)];
}
const pad = (a: string[], n: number) => [...a, ...blank(n - a.length)].slice(0, n);

export const CONTROL_GRID: Grid = [
  row([], ["Merchandise Report"], []),
  row([], ["Brand Name", "Product Division", "Product Group", "Product Category", "", "Product Code", "", "", ""], ["", "", "Sales Name", "Product Code", "", "", "Type", "Brand", "Details"]),
  row(["1/Okt/26", "27.297.000", "27.297.000", "-"],
    ["APPLE", "HEALTH EQUIPMENT", "DEVICES", "PHONE", "01-10-2026", "ART-IP1 / IPHONE TEST 256GB", "1", "0", "24.999.000"],
    ["01-10-2026", "11110001", "Staff A", "ART-IP1 / IPHONE TEST 256GB", "100000001", "24.999.000", "DEVICES", "APPLE", "PHONE"]),
  row(["2/Okt/26", "6.398.000", "6.398.000", "-"],
    ["APPLE", "HEALTH EQUIPMENT", "ACCESSORIES", "EARPHONES", "01-10-2026", "ART-AP1 / AIRPODS TEST", "1", "0", "1.599.000"],
    ["01-10-2026", "11110001", "Staff A", "ART-AP1 / AIRPODS TEST", "100.000.001,00", "1.599.000", "ACCESSORIES", "APPLE", "EARPHONES"]),
  row([],
    ["KOALA", "HEALTH EQUIPMENT", "ACCESSORIES", "PROTECTION", "01-10-2026", "ART-QO1 / PROTEKSI TEST", "1", "0", "699.000"],
    ["01-10-2026", "11110001", "Staff A", "ART-QO1 / PROTEKSI TEST", "100000001", "699.000", "ACCESSORIES", "KOALA", "PROTECTION"]),
  row([],
    ["MICROPACK", "HEALTH EQUIPMENT", "ACCESSORIES", "CASE", "02-10-2026", "ART-CS1 / CASE TEST", "2", "0", "598.000"],
    ["02-10-2026", "11110002", "Staff B", "ART-CS1 / CASE TEST", "100000002", "598.000", "ACCESSORIES", "MICROPACK", "CASE"]),
  row([],
    ["SAMSUNG", "HEALTH EQUIPMENT", "DEVICES", "PHONE", "02-10-2026", "ART-SS1 / GALAXY TEST", "1", "0", "4.000.000"],
    ["02-10-2026", "11110002", "Staff B", "ART-SS1 / GALAXY TEST", "100000002", "4.000.000", "DEVICES", "SAMSUNG", "PHONE"]),
  row([],
    ["SAMSUNG", "HEALTH EQUIPMENT", "DEVICES", "WATCH", "02-10-2026", "ART-SW1 / GALAXY WATCH TEST", "1", "0", "1.800.000"],
    ["02-10-2026", "", "Mapemall", "ART-SW1 / GALAXY WATCH TEST", "100000003", "1.800.000", "DEVICES", "SAMSUNG", "WATCH"]),
  row([],
    ["DIGIMAP", "HEALTH EQUIPMENT", "SUPPORTING", "OTHER", "02-10-2026", "ART-BAG / PAPER BAG", "3", "0", "0"],
    ["02-10-2026", "11110002", "Staff B", "ART-BAG / PAPER BAG", "100000002", "0", "SUPPORTING", "NON MD DIGIMAP", "OTHER"]),
  // a row from the previous month that must be ignored
  row([],
    ["APPLE", "HEALTH EQUIPMENT", "DEVICES", "PHONE", "30-09-2026", "ART-IP1 / IPHONE TEST 256GB", "1", "0", "24.999.000"],
    ["30-09-2026", "11110001", "Staff A", "ART-IP1 / IPHONE TEST 256GB", "99999999", "24.999.000", "DEVICES", "APPLE", "PHONE"]),
];

export const TARGET_GRID: Grid = [
  ["", "STORE001"],
  ["", "Target Store"],
  ["", "100%", "60%", "30%", "6%", "4%"],
  ["", "Total Target", "Apple", "Android", "Accessories", "VAS"],
  ["", "1.000.000.000", "600.000.000", "300.000.000", "60.000.000", "40.000.000"],
  [],
  ["", "Apple"],
  ["", "Target (%)", "", "70%", "30%", "100%"],
  ["", "Target (IDR)", "", "420.000.000", "180.000.000", "600.000.000"],
  ["", "Name", "Target", "iPhone", "Mac", "Total"],
  ["", "Staff A", "50%", "210.000.000", "90.000.000", "300.000.000"],
  ["", "Staff B", "50%", "210.000.000", "90.000.000", "300.000.000"],
  ["", "Total", "100%", "420.000.000", "180.000.000", "600.000.000"],
  [],
  ["", "Android"],
  ["", "Target (%)", "", "100%", "100%"],
  ["", "Target (IDR)", "", "300.000.000", "300.000.000", "", "", "Forecast"],
  ["", "Name", "Target", "Samsung", "Total"],
  ["", "Staff A", "50%", "150.000.000", "150.000.000"],
  ["", "Staff B", "50%", "150.000.000", "150.000.000"],
  ["", "Total", "100%", "300.000.000", "300.000.000"],
  [],
  ["", "Accessories"],
  ["", "Target (%)", "", "50%", "50%", "100%"],
  ["", "Target (IDR)", "", "30.000.000", "30.000.000", "60.000.000"],
  ["", "Name", "Target", "Dino", "Apple", "Total"],
  ["", "Staff A", "50%", "15.000.000", "15.000.000", "30.000.000"],
  ["", "Staff B", "50%", "15.000.000", "15.000.000", "30.000.000"],
  ["", "Total", "100%", "30.000.000", "30.000.000", "60.000.000"],
  [],
  ["", "VAS"],
  ["", "Target (%)", "", "100%", "100%"],
  ["", "Target (IDR)", "", "40.000.000", "40.000.000"],
  ["", "Name", "Target", "Qoala", "Total"],
  ["", "Staff A", "50%", "20.000.000", "20.000.000"],
  ["", "Staff B", "50%", "20.000.000", "20.000.000"],
  ["", "Total", "100%", "40.000.000", "40.000.000"],
];
