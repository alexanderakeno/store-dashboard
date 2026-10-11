/** Build a link that keeps the current query (month etc.) and applies a patch. */
export function withQuery(path: string, q: Record<string, string>, patch: Record<string, string | null | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}
