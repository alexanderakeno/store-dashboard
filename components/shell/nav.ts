/**
 * Sidebar menu. Order and grouping follow the reference layout:
 * Dashboard · Target Fokus · Administrasi · Promo Board · Reporting · System.
 */
export type IconName =
  | "dashboard" | "trending" | "summary" | "users" | "wallet" | "package" | "stokan"
  | "gauge" | "sheet" | "sparkles" | "check" | "card" | "upload" | "chart" | "message" | "cloud" | "settings" | "tag" | "shield";

export interface NavLink {
  href: string;
  label: string;
  icon: IconName;
  color: string; // tailwind text color for the icon
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  icon: IconName;
  color: string;
  items: NavLink[];
}

export type NavEntry = NavGroup | NavLink;

export const NAV: NavEntry[] = [
  {
    label: "Dashboard",
    icon: "dashboard",
    color: "text-sky-400",
    items: [
      { href: "/home", label: "Overview", icon: "dashboard", color: "text-sky-400" },
      { href: "/sales", label: "Daily Sales", icon: "trending", color: "text-emerald-400" },
      { href: "/summary", label: "Daily Summary", icon: "summary", color: "text-amber-400" },
      { href: "/staff", label: "Staff Performance", icon: "users", color: "text-violet-400" },
      { href: "/incentive", label: "Est. Incentive", icon: "wallet", color: "text-cyan-400" },
      { href: "/soh", label: "SOH", icon: "package", color: "text-orange-400" },
      { href: "/stokan", label: "Stokan", icon: "stokan", color: "text-slate-300" },
    ],
  },
  {
    label: "Target Fokus",
    icon: "gauge",
    color: "text-violet-400",
    items: [
      { href: "/focus/lob", label: "LOB Target Fokus", icon: "gauge", color: "text-rose-400" },
      { href: "/focus/3pp", label: "Product Fokus 3PP", icon: "sheet", color: "text-yellow-400" },
      { href: "/focus/vas", label: "VAS Fokus", icon: "sparkles", color: "text-fuchsia-400" },
      { href: "/focus/android", label: "Android Fokus", icon: "trending", color: "text-orange-300" },
    ],
  },
  {
    label: "Administrasi",
    icon: "check",
    color: "text-orange-400",
    items: [
      { href: "/mading", label: "Mading", icon: "sheet", color: "text-sky-400" },
      { href: "/bnpl", label: "BNPL & Trade-In", icon: "card", color: "text-emerald-400" },
      { href: "/checklist/spv", label: "Checklist Store - SPV", icon: "check", color: "text-teal-400" },
      { href: "/checklist/staff", label: "Checklist Store - Staff", icon: "check", color: "text-cyan-400" },
      { href: "/upload", label: "Data Upload", icon: "upload", color: "text-indigo-400" },
    ],
  },
  { href: "/promo", label: "Promo Board", icon: "tag", color: "text-amber-300" },
  {
    label: "Reporting",
    icon: "chart",
    color: "text-emerald-400",
    items: [
      { href: "/feedback", label: "Feedback", icon: "message", color: "text-rose-400" },
      { href: "/cx", label: "NPS/CX & Member", icon: "cloud", color: "text-sky-400" },
      { href: "/weekly", label: "Weekly Report", icon: "chart", color: "text-emerald-400" },
      { href: "/weekly-reason", label: "Weekly Reason", icon: "sparkles", color: "text-amber-400" },
    ],
  },
  {
    label: "System",
    icon: "settings",
    color: "text-slate-400",
    items: [
      { href: "/cutoff", label: "Cut Off & Rekonsiliasi", icon: "shield", color: "text-emerald-300" },
      { href: "/settings", label: "Settings", icon: "settings", color: "text-slate-400" },
    ],
  },
];

export const isGroup = (e: NavEntry): e is NavGroup => "items" in e;

/** Page title for a pathname (used by the header breadcrumb). */
export function titleFor(path: string): string {
  for (const e of NAV) {
    const links = isGroup(e) ? e.items : [e];
    const hit = links.find((l) => path === l.href || path.startsWith(`${l.href}/`));
    if (hit) return hit.label;
  }
  return "Overview";
}
