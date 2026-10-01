"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { NAV } from "./nav";

function useHref() {
  const sp = useSearchParams();
  const m = sp.get("m");
  return (href: string) => (m ? `${href}?m=${m}` : href);
}

export function Sidebar({ isAdmin, brand }: { isAdmin: boolean; brand: React.ReactNode }) {
  const path = usePathname();
  const href = useHref();
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);
  return (
    <nav className="sidebar" aria-label="Menu utama">
      <div className="brand">{brand}</div>
      {items.filter((n) => !n.soon).map((n) => (
        <Link key={n.href} href={href(n.href)} aria-current={path.startsWith(n.href) ? "page" : undefined}>
          <Icon name={n.icon} /> {n.label}
        </Link>
      ))}
      <div className="sep">Segera</div>
      {items.filter((n) => n.soon).map((n) => (
        <Link key={n.href} href={href(n.href)} aria-current={path.startsWith(n.href) ? "page" : undefined}>
          <Icon name={n.icon} /> {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const href = useHref();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const primary = NAV.filter((n) => n.primary);
  const rest = NAV.filter((n) => !n.primary && (!n.adminOnly || isAdmin));
  const moreActive = rest.some((n) => path.startsWith(n.href));
  return (
    <>
      <nav className="bottomnav" aria-label="Menu utama">
        {primary.map((n) => (
          <Link key={n.href} href={href(n.href)} aria-current={path.startsWith(n.href) ? "page" : undefined}>
            <Icon name={n.icon} />
            {n.label}
          </Link>
        ))}
        <button type="button" onClick={() => setOpen(true)} aria-current={moreActive ? "page" : undefined} aria-haspopup="dialog">
          <Icon name="more" />
          Lainnya
        </button>
      </nav>
      {open && (
        <>
          <div className="sheet-backdrop" onClick={() => setOpen(false)} />
          <div className="sheet" role="dialog" aria-label="Menu lainnya">
            <div className="handle" />
            {rest.map((n) => (
              <Link key={n.href} href={href(n.href)}>
                <Icon name={n.icon} />
                {n.label}
                {n.soon && <span className="muted small">segera</span>}
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
