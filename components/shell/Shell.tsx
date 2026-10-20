"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, Moon, RefreshCw, Sun, Upload } from "lucide-react";
import { NAV, isGroup, titleFor, type NavLink } from "./nav";
import { NavIcon } from "./Icon";

export interface ShellProps {
  children: React.ReactNode;
  storeCode: string;
  storeName: string;
  userName: string;
  isAdmin: boolean;
  fixture: boolean;
}

function useHref() {
  const sp = useSearchParams();
  const m = sp.get("m");
  return (href: string) => (m ? `${href}?m=${m}` : href);
}

/** Tells the server which page was opened (access log). Fire-and-forget; never blocks navigation. */
function useTrackView(path: string) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!path || last.current === path) return;
    last.current = path;
    const body = JSON.stringify({ path });
    try {
      if (navigator.sendBeacon?.("/api/access-log", new Blob([body], { type: "application/json" }))) return;
    } catch {}
    fetch("/api/access-log", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  }, [path]);
}

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

export function Shell({ children, storeCode, storeName, userName, isAdmin, fixture }: ShellProps) {
  const path = usePathname();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop
  useEffect(() => setOpen(false), [path]);
  useTrackView(path);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sd-collapsed") === "1");
    } catch {}
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sd-collapsed", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  return (
    <div className="sd-shell" data-collapsed={collapsed}>
      <Sidebar open={open} onClose={() => setOpen(false)} onCollapse={toggleCollapsed} storeCode={storeCode} storeName={storeName} isAdmin={isAdmin} />
      {open && <div className="sd-backdrop lg:hidden" onClick={() => setOpen(false)} />}
      <main className="sd-main">
        <Header storeCode={storeCode} userName={userName} isAdmin={isAdmin} fixture={fixture} onMenu={() => setOpen(true)} collapsed={collapsed} onExpand={toggleCollapsed} />
        {children}
      </main>
    </div>
  );
}

function Sidebar({ open, onClose, onCollapse, storeCode, storeName, isAdmin }: { open: boolean; onClose: () => void; onCollapse: () => void; storeCode: string; storeName: string; isAdmin: boolean }) {
  const path = usePathname();
  const href = useHref();
  const visible = (l: NavLink) => !l.adminOnly || isAdmin;
  const initialOpen = () => Object.fromEntries(NAV.filter(isGroup).map((g) => [g.label, true]));
  const [groups, setGroups] = useState<Record<string, boolean>>(initialOpen);

  return (
    <aside className="sd-sidebar" data-open={open} aria-label="Menu utama">
      <div className="flex h-full flex-col">
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-3 border-b border-white/10 pb-5">
            <div className={`sd-logo ${storeCode.length > 4 ? "!text-[10px]" : ""}`}>{storeCode}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] leading-tight font-extrabold tracking-[-.015em] text-slate-50">{storeName}</p>
              <p className="mt-0.5 text-[10.5px] font-semibold text-[#8e9ab0]">Sales Dashboard</p>
              <span className="sd-brand-blocks" aria-hidden><i /><i /><i /></span>
            </div>
            <button type="button" className="sd-brand-close" onClick={() => (window.innerWidth >= 1024 ? onCollapse() : onClose())} aria-label="Tutup menu">
              <ChevronLeft className="size-4" />
            </button>
          </div>
        </div>
        <nav className="space-y-2 px-3 pb-8">
          {NAV.map((entry) => {
            if (!isGroup(entry)) {
              if (!visible(entry)) return null;
              return (
                <Link key={entry.href} href={href(entry.href)} prefetch={false} className="sd-nav-item !pl-4 !text-sm !font-bold" aria-current={isActive(path, entry.href) ? "page" : undefined}>
                  <NavIcon name={entry.icon} className={`size-4 shrink-0 ${entry.color}`} />
                  <span>{entry.label}</span>
                </Link>
              );
            }
            const items = entry.items.filter(visible);
            if (!items.length) return null;
            const isOpen = groups[entry.label] ?? true;
            return (
              <div key={entry.label} className="sd-nav-group">
                <button type="button" className="sd-nav-group-btn" aria-expanded={isOpen} onClick={() => setGroups((g) => ({ ...g, [entry.label]: !isOpen }))}>
                  <NavIcon name={entry.icon} className={`size-4 shrink-0 ${entry.color}`} />
                  <span className="flex-1 text-left">{entry.label}</span>
                  <ChevronDown className={`size-4 transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="mt-2 ml-4 space-y-1 border-l border-white/10 pl-3 lg:mt-1 lg:ml-0 lg:border-l-0 lg:pl-0">
                    {items.map((l) => (
                      <Link key={l.href} href={href(l.href)} prefetch={false} className="sd-nav-item" aria-current={isActive(path, l.href) ? "page" : undefined}>
                        <NavIcon name={l.icon} className={`size-3.5 shrink-0 ${l.color}`} />
                        <span>{l.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

function Header({ storeCode, userName, isAdmin, fixture, onMenu, collapsed, onExpand }: { storeCode: string; userName: string; isAdmin: boolean; fixture: boolean; onMenu: () => void; collapsed: boolean; onExpand: () => void }) {
  const path = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("sd-theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  };

  const refresh = async () => {
    setBusy(true);
    setMsg("");
    try {
      if (isAdmin) {
        const r = await fetch("/api/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: sp.get("m") ?? undefined }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Gagal memperbarui");
      }
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setTimeout(() => setBusy(false), 400);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <header className="sd-header sd-no-print">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-7">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <button type="button" className="sd-hbtn icon lg:hidden" onClick={onMenu} aria-label="Buka menu">
            <Menu className="size-4" />
          </button>
          {collapsed && (
            <button type="button" className="sd-hbtn icon max-lg:hidden" onClick={onExpand} aria-label="Tampilkan menu">
              <ChevronRight className="size-4" />
            </button>
          )}
          <span className="sd-mini-blocks max-sm:hidden" aria-hidden><i /><i /><i /></span>
          <span className="text-slate-400 max-sm:hidden">{storeCode}</span>
          <ChevronRight className="size-3.5 text-slate-400 max-sm:hidden" />
          <b className="truncate">{titleFor(path)}</b>
          {fixture && <span className="sd-badge amber ml-1">DATA SINTETIS</span>}
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs font-semibold text-rose-600 max-md:hidden" role="alert">{msg}</span>}
          <button type="button" className="sd-hbtn icon" onClick={toggleTheme} aria-label={dark ? "Mode terang" : "Mode gelap"} title={dark ? "Mode terang" : "Mode gelap"}>
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          {isAdmin && (
            <Link prefetch={false} href={sp.get("m") ? `/upload?m=${sp.get("m")}#import` : "/upload#import"} className="sd-hbtn" title="Import Raw MR & Sales Person">
              <Upload className="size-4" />
              <span className="max-sm:hidden">Import</span>
            </Link>
          )}
          <button type="button" className="sd-hbtn" onClick={refresh} disabled={busy} title={isAdmin ? "Baca ulang data dari Google Sheet" : "Muat ulang tampilan"}>
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
            <span className="max-sm:hidden">Perbarui</span>
          </button>
          <button type="button" className="sd-hbtn danger" onClick={logout} title={`Keluar (${userName})`}>
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </div>
    </header>
  );
}
