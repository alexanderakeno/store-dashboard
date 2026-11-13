import "server-only";
import { cached, shared } from "@/lib/cache";
import { dataSource } from "@/lib/repositories";
import type { PwpPromo } from "@/types/pwpPromo";

/** Changes only on import (which expires the "pwppromo" tag). */
const TTL_SEC = 60;

/** Samsung PWP is part of Promo Samsung (its own workbook), so it is not shown again here. */
const SKIP_BRANDS = new Set(["Samsung"]);
const shown = (p: PwpPromo | null): PwpPromo | null => {
  if (!p) return null;
  const programs = p.programs.filter((x) => !SKIP_BRANDS.has(x.brand));
  return programs.length === p.programs.length ? p : { ...p, programs };
};

/** Cached read of the stored PWP promo (without Samsung). null = never imported; a failed read THROWS. */
export async function getPwpPromo(): Promise<PwpPromo | null> {
  const { value } = await cached("pwppromo:shown", TTL_SEC * 1000, () => shared(["pwppromo", "shown"], ["pwppromo"], TTL_SEC, async () => shown(await dataSource().getPwpPromo())));
  return value ?? shown(await dataSource().getPwpPromo());
}
