import { Activity, BellRing, ChartNoAxesCombined, ClipboardList, FileChartColumn, FlaskConical, Gauge, Map, SearchCheck, Settings2, ShieldCheck, SlidersHorizontal, type LucideIcon } from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon; description: string; eyebrow: string };

export const navigation: NavItem[] = [
  { label: "Overview", href: "/", icon: Gauge, eyebrow: "Workspace overview", description: "A clear starting point for plant energy decisions." },
  { label: "Live Energy Map", href: "/live-energy-map", icon: Map, eyebrow: "Plant visibility", description: "Explore the equipment and utility topology." },
  { label: "Loss Detective", href: "/loss-detective", icon: SearchCheck, eyebrow: "Investigation", description: "Investigate avoidable energy loss and unusual operation." },
  { label: "Opportunities", href: "/opportunities", icon: BellRing, eyebrow: "Action planning", description: "Prioritize practical improvements across the factory." },
  { label: "What-If Lab", href: "/what-if-lab", icon: FlaskConical, eyebrow: "Scenario planning", description: "Explore potential changes before acting." },
  { label: "Verification", href: "/verification", icon: ShieldCheck, eyebrow: "Measurement", description: "Review the evidence behind completed improvements." },
  { label: "SenseROI", href: "/sense-roi", icon: ChartNoAxesCombined, eyebrow: "Business case", description: "Connect energy decisions to operational value." },
  { label: "Operator Logs", href: "/operator-logs", icon: ClipboardList, eyebrow: "Shop floor context", description: "Review production jobs behind plant events." },
  { label: "Operator Insights", href: "/operator-insights", icon: ClipboardList, eyebrow: "Shop floor intelligence", description: "Link operator context to machine-state diagnosis and energy impact." },
  { label: "Energy Audit", href: "/energy-audit", icon: Activity, eyebrow: "Audit workspace", description: "Organize findings and audit evidence." },
  { label: "Reports", href: "/reports", icon: FileChartColumn, eyebrow: "Communication", description: "Prepare clear updates for plant and management teams." },
  { label: "Factory Setup", href: "/factory-setup", icon: SlidersHorizontal, eyebrow: "Configuration", description: "Maintain the factory structure used in the workspace." },
  { label: "Settings", href: "/settings", icon: Settings2, eyebrow: "Preferences", description: "Manage the demo workspace preferences." }
];

export const pageSlugs = navigation.filter((item) => item.href !== "/").map((item) => item.href.slice(1));
