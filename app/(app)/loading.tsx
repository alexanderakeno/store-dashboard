/** Instant feedback while a page's data loads (shown inside the Shell on navigation). */
export default function Loading() {
  return (
    <div className="sd-content" aria-busy="true" aria-label="Memuat data">
      <div className="h-7 w-48 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sd-panel h-32 animate-pulse" />
        ))}
      </div>
      <div className="sd-panel h-64 animate-pulse" />
    </div>
  );
}
