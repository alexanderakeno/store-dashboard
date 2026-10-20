"use client";

/**
 * Row of chips that scroll the page to a section (`id`). Plain anchors underneath, so it still
 * works without JavaScript; with JS the scroll is smooth and lands below the sticky header.
 */
export function JumpChips({ items, label = "Lompat ke tabel" }: { items: Array<{ id: string; label: string }>; label?: string }) {
  const go = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      history.replaceState(null, "", `#${id}`);
    } catch {}
  };
  return (
    <nav aria-label={label} className="flex min-w-0 flex-wrap gap-2">
      {items.map((i) => (
        <a key={i.id} href={`#${i.id}`} onClick={(e) => go(e, i.id)} className="sd-pill !px-3.5 !py-1.5 text-sm font-semibold whitespace-nowrap">
          {i.label}
        </a>
      ))}
    </nav>
  );
}
