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
      case "incentive": {
        if (!isObj(v)) return { ok: false, error: "incentive: harus objek { perUnit, qoalaTiers }" };
        const inc: Partial<BusinessRules["incentive"]> = {};
        if (v.perUnit !== undefined) {
          if (!isObj(v.perUnit) || !Object.values(v.perUnit).every((n) => typeof n === "number" && n >= 0 && n <= 10_000_000))
            return { ok: false, error: 'incentive.perUnit: harus objek { "iPhone": 30000, … }' };
          inc.perUnit = v.perUnit as Record<string, number>;
        }
        if (v.qoalaTiers !== undefined) {
          const ok = Array.isArray(v.qoalaTiers) && v.qoalaTiers.length > 0 && v.qoalaTiers.every((x) => isObj(x) && typeof x.min === "number" && x.min >= 0 && typeof x.fee === "number" && x.fee >= 0 && x.fee <= 10_000_000);
          if (!ok) return { ok: false, error: 'incentive.qoalaTiers: daftar { "min": 1000000, "fee": 40000 }' };
          inc.qoalaTiers = (v.qoalaTiers as Array<{ min: number; fee: number }>).map((x) => ({ min: x.min, fee: x.fee }));
        }
        if (v.online !== undefined) {
          const o = v.online;
          const ok = isObj(o) && (o.accounts === undefined || (Array.isArray(o.accounts) && o.accounts.every((x) => typeof x === "string"))) && (o.perUnit === undefined || (typeof o.perUnit === "number" && o.perUnit >= 0 && o.perUnit <= 10_000_000));
          if (!ok) return { ok: false, error: 'incentive.online: { "accounts": ["DIGIPLUS.CO.ID", "MAPEMALL"], "perUnit": 5000 }' };
          inc.online = { ...(o.accounts !== undefined ? { accounts: o.accounts as string[] } : {}), ...(o.perUnit !== undefined ? { perUnit: o.perUnit as number } : {}) } as BusinessRules["incentive"]["online"];
        }
        out.incentive = inc as BusinessRules["incentive"];
        break;
      }
      default:
        return { ok: false, error: `Kunci tidak dikenal: ${k}` };
    }
  }
  return { ok: true, value: out };
}
