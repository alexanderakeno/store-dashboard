"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";

/** Re-runs the server render of the current page (after a failed Google Sheets read). */
export function RetryButton({ label = "Coba lagi" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="sd-btn primary" disabled={pending} onClick={() => start(() => router.refresh())}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
      {label}
    </button>
  );
}
