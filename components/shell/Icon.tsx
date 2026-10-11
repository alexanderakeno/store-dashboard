import {
  ChartNoAxesCombined, ClipboardCheck, ClipboardList, Cloud, CreditCard, FileSpreadsheet, Gauge, Grid3x3, LayoutDashboard,
  MessageSquare, PackageSearch, Settings, ShieldCheck, Tag, TrendingUp, Upload, Users, WalletCards, WandSparkles, type LucideIcon,
} from "lucide-react";
import type { IconName } from "./nav";

const MAP: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  trending: TrendingUp,
  summary: ClipboardList,
  users: Users,
  wallet: WalletCards,
  package: PackageSearch,
  stokan: Grid3x3,
  gauge: Gauge,
  sheet: FileSpreadsheet,
  sparkles: WandSparkles,
  check: ClipboardCheck,
  card: CreditCard,
  upload: Upload,
  chart: ChartNoAxesCombined,
  message: MessageSquare,
  cloud: Cloud,
  settings: Settings,
  tag: Tag,
  shield: ShieldCheck,
};

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const C = MAP[name];
  return <C className={className} aria-hidden />;
}
