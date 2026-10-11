import type { BusinessRules } from "@/config/business";
import { GROUPS, type Group } from "@/types/domain";

type Result = { ok: true; value: Partial<BusinessRules> } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strMap = (v: unknown) => isObj(v) && Object.entries(v).every(([k, x]) => k.trim() && typeof x === "string" && x.trim());
const strList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim());

/** Validates admin-edited rule overrides. Unknown keys are rejected so typos surface. */
export function validateRuleOverrides(input: unknown): Result {
  if (!isObj(input)) return { ok: false, error: "Rules harus berupa objek JSON" };
  const out: Partial<BusinessRules> = {};
  for (const [k, v] of Object.entries(input)) {
    switch (k) {
      case "vasBrands":
      case "vasArticlePrefixes":
      case "appleLob":
      case "accSuppliers":
        if (!strMap(v)) return { ok: false, error: `${k}: harus objek { "BRAND": "Nama" }` };
        out[k] = Object.fromEntries(Object.entries(v as Record<string, string>).map(([a, b]) => [a.trim().toUpperCase(), b.trim()]));
        break;
      case "supplierOrder":
      case "channelNames":
      case "qtyTypes":
        if (!strList(v)) return { ok: false, error: `${k}: harus daftar teks` };
        out[k] = (v as string[]).map((x) => x.trim());
        break;
      case "groupOverrides": {
        if (!Array.isArray(v)) return { ok: false, error: "groupOverrides: harus daftar" };
        for (const o of v) {
          if (!isObj(o) || typeof o.brand !== "string" || !GROUPS.includes(o.group as Group))
            return { ok: false, error: 'groupOverrides: tiap item butuh "brand" dan "group" (Apple/Android/ACC/VAS)' };
        }
        out.groupOverrides = v as BusinessRules["groupOverrides"];
        break;
      }
      case "pointCaps": {
        if (!isObj(v)) return { ok: false, error: "pointCaps: harus objek" };
        const caps: Partial<Record<Group, number>> = {};
        for (const [g, n] of Object.entries(v)) {
          if (!GROUPS.includes(g as Group) || typeof n !== "number" || n < 0 || n > 1000) return { ok: false, error: `pointCaps.${g} tidak valid` };
          caps[g as Group] = n;
        }
        out.pointCaps = caps as BusinessRules["pointCaps"];
        break;
      }
      case "estimateMinDays":
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 31) return { ok: false, error: "estimateMinDays: bilangan 0–31" };
        out.estimateMinDays = v;
        break;
      default:
        return { ok: false, error: `Kunci tidak dikenal: ${k}` };
    }
  }
  return { ok: true, value: out };
}
