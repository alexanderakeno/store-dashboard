/** Device type tabs inside an Android brand on the SOH page. */
export type DeviceType = "Phone" | "Tablet" | "Watch" | "Lainnya";
export const DEVICE_TYPES: DeviceType[] = ["Phone", "Tablet", "Watch", "Lainnya"];

/** SOH categories that are one brand of Android devices (split into Phone / Tablet / Watch). */
const NOT_SPLIT = new Set(["IPHONE", "IPAD", "MACBOOK", "IMAC", "APPLE WATCH", "AIRPODS", "APPLE", "AKSESORIS", "ELEKTRONIK", "ACCESSORIES"]);
export const splitsByType = (category: string) => !NOT_SPLIT.has(category.trim().toUpperCase());

/**
 * Phone / Tablet / Watch (watches, bands, Galaxy Fit, buds, rings) / Lainnya (routers) from the description —
 * works for both SOH sources (the PDF has no product category column).
 */
export function deviceType(category: string, description: string): DeviceType {
  const d = ` ${description.toUpperCase()} `;
  if (/\bAMAZFIT\b/i.test(category)) return "Watch";
  if (/\bTAB\b|PAD\b|\bTABLET\b/.test(d)) return "Tablet";
  if (/\b(WATCH|SMARTWATCH|BAND|FIT|BUDS|RING)\b/.test(d)) return "Watch";
  if (/\b(ROUTER|CPE|MIFI|WIFI BE\d*)\b/.test(d)) return "Lainnya";
  return "Phone";
}

/** Samsung phone series, in display order A → S → Z (then the rest). */
export const SAMSUNG_SERIES = ["A Series", "S Series", "Z Series", "M Series", "Lainnya"] as const;
export type SamsungSeries = (typeof SAMSUNG_SERIES)[number];

export function samsungSeries(description: string): SamsungSeries {
  const d = description.toUpperCase();
  if (/\bZ\s*(FOLD|FLIP|TRIFOLD)|\bGALAXY Z\b/.test(d)) return "Z Series";
  if (/\bGALAXY S\d/.test(d)) return "S Series";
  if (/\bGALAXY A\d/.test(d)) return "A Series";
  if (/\bGALAXY M\d/.test(d)) return "M Series";
  return "Lainnya";
}

export const isSamsung = (category: string) => category.trim().toUpperCase() === "SAMSUNG";
