import type { BusinessRules } from "@/config/business";
import type { Group, SalesLineRaw } from "@/types/domain";
import { nameKey, normalizeKey } from "./normalize";

/**
 * The ONLY place that decides group / LOB / VAS provider / supplier / channel.
 * Every page and every calculation goes through this.
 */
export interface Classification {
  group: Group;
  lob: string | null;
  vasProvider: string | null;
  supplier: string | null;
  isChannel: boolean;
  countsInQty: boolean;
}

export function classify(line: Pick<SalesLineRaw, "type" | "brand" | "category" | "description" | "nik" | "staffName"> & { article?: string }, rules: BusinessRules): Classification {
  const brand = normalizeKey(line.brand);
  const type = normalizeKey(line.type);
  const category = normalizeKey(line.category);
  const description = normalizeKey(line.description);

  const article = normalizeKey(line.article);
  const prefix = Object.keys(rules.vasArticlePrefixes ?? {}).find((k) => k && article.startsWith(normalizeKey(k)));
  const vasProvider = rules.vasBrands[brand] ?? (prefix ? rules.vasArticlePrefixes[prefix] : null);
  let group: Group;
  if (vasProvider) group = "VAS";
  else {
    const override = rules.groupOverrides.find(
      (o) => normalizeKey(o.brand) === brand && (!o.category || normalizeKey(o.category) === category) && (!o.type || normalizeKey(o.type) === type),
    );
    if (override) group = override.group;
    else if (type === "DEVICES") group = brand === "APPLE" ? "Apple" : "Android";
    else group = "ACC";
  }

  let lob: string | null = null;
  if (brand === "APPLE") {
    if (type === "DEVICES") lob = rules.appleLob[category] ?? "Apple Other";
    else if (description.includes("AIRPODS")) lob = "AirPods";
  } else if (group === "Android") {
    lob = titleBrand(brand);
  }

  const supplier = group === "ACC" ? rules.accSuppliers[brand] ?? null : null;
  const channelKeys = rules.channelNames.map(nameKey);
  const isChannel = !line.nik && channelKeys.includes(nameKey(line.staffName));
  const countsInQty = rules.qtyTypes.map(normalizeKey).includes(type);

  return { group, lob, vasProvider, supplier, isChannel, countsInQty };
}

function titleBrand(brand: string): string {
  return brand.charAt(0) + brand.slice(1).toLowerCase();
}
