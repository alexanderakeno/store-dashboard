export interface NavItem {
  href: string;
  label: string;
  icon: string;
  primary?: boolean;
  adminOnly?: boolean;
  soon?: string;
}

/** Order = bottom nav order on mobile (first 4 primary + "Lainnya"). */
export const NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: "home", primary: true },
  { href: "/sales", label: "Sales", icon: "sales", primary: true },
  { href: "/staff", label: "Staff", icon: "staff", primary: true },
  { href: "/focus", label: "Focus", icon: "focus", primary: true },
  { href: "/weekly", label: "Weekly", icon: "weekly" },
  { href: "/cutoff", label: "Cut Off", icon: "cutoff" },
  { href: "/settings", label: "Settings", icon: "settings", adminOnly: true },
  { href: "/compare", label: "Compare", icon: "compare", soon: "Menunggu import data historis" },
  { href: "/promo", label: "Promo", icon: "promo", soon: "Input promo di aplikasi — fase 2" },
  { href: "/feedback", label: "Feedback", icon: "feedback", soon: "Input feedback di aplikasi — fase 2" },
  { href: "/checklist", label: "Checklist", icon: "checklist", soon: "Checklist harian — fase 2" },
  { href: "/stock", label: "Stock", icon: "stock", soon: "Menunggu contoh file SOH" },
  { href: "/cx", label: "CX & Member", icon: "cx", soon: "Dijadwalkan nanti" },
];
