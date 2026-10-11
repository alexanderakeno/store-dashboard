import { notFound, redirect } from "next/navigation";

/** Old phase-1 placeholder routes now live elsewhere in the menu. */
const MOVED: Record<string, string> = {
  compare: "/home?tab=compare",
  stock: "/soh",
  checklist: "/checklist/spv",
};

export default async function LegacyModule({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const to = MOVED[module];
  if (!to) notFound();
  redirect(to);
}
