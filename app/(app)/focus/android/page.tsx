import { redirect } from "next/navigation";
import type { SearchParams } from "@/lib/page";

/** Android Fokus moved into LOB Target Fokus (tab Android); old links keep working. */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string" && v) q.set(k, v);
  q.set("g", "android");
  redirect(`/focus/lob?${q.toString()}`);
}
