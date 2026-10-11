import "server-only";
import { byStaff } from "@/lib/domain/kpi";
import { displayName } from "@/lib/domain/normalize";
import type { MonthSnapshot } from "@/lib/services/dashboard";

/** Staff names of the month (people with sales or a target), channels excluded. */
export function staffNames(s: MonthSnapshot): string[] {
  return byStaff(s.lines, s.target).staff.map((r) => displayName(r.name)).sort((a, b) => a.localeCompare(b));
}
