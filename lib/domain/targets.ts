import { nameKey } from "./normalize";
import type { Group, StoreTarget } from "@/types/domain";

/**
 * Staff target for one item of a group (Apple LOB, Android brand, VAS provider, …), for the whole month.
 *
 * Android: when Target Store lists the store target per brand in its "Total Target" block, each staff's
 * Android target is split by those brand shares — so the staff targets of a brand always add up to the
 * store's brand target. Otherwise (and for the other groups) the staff's column in the group section is used.
 */
export function staffItemTarget(target: StoreTarget | null | undefined, staffName: string, group: Group, item: string): number {
  const st = target?.staff.find((x) => nameKey(x.name) === nameKey(staffName));
  if (!st) return 0;
  const brands = group === "Android" ? target?.brands : undefined;
  if (brands && Object.keys(brands).length) {
    const sum = Object.values(brands).reduce((a, b) => a + b, 0);
    const key = Object.keys(brands).find((b) => nameKey(b) === nameKey(item));
    return key && sum ? (st.byGroup.Android * brands[key]) / sum : 0;
  }
  const col = target?.sections[group]?.columns.find((c) => nameKey(c) === nameKey(item));
  return col ? (st.byColumn[`${group}:${col}`] ?? 0) : 0;
}
