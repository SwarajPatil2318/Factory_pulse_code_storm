import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { ChartContainer } from "@/components/chart-container";
import { EmptyState } from "@/components/empty-state";
import { FactorySetup } from "@/components/factory-setup/factory-setup";
import { LiveEnergyMap } from "@/components/energy-map/live-energy-map";
import { ProductionLog } from "@/components/simulation/production-log";
import { OperatorInsights } from "@/components/operator-intelligence/operator-insights";
import { LossDetectiveWorkspace } from "@/components/production-energy/loss-detective-workspace";
import { OpportunitiesDashboard } from "@/components/decision-engine/opportunities-dashboard";
import { WhatIfLab } from "@/components/what-if/what-if-lab";
import { SenseRoiPage } from "@/components/sense-roi/sense-roi-page";
import { VerificationPage } from "@/components/verification/verification-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_LABEL } from "@/lib/demo";
import { navigation, pageSlugs } from "@/lib/navigation";

export function generateStaticParams() { return pageSlugs.map((section) => ({ section })); }

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const item = navigation.find((entry) => entry.href === `/${section}`);
  if (!item) notFound();
  const Icon = item.icon;
  return <>
    <PageHeading eyebrow={item.eyebrow} title={item.label} description={item.description} />
    {section === "factory-setup" ? <FactorySetup /> :
    section === "live-energy-map" ? <LiveEnergyMap /> :
    section === "operator-logs" ? <ProductionLog /> :
    section === "operator-insights" ? <OperatorInsights /> :
    section === "loss-detective" ? <LossDetectiveWorkspace /> :
    section === "opportunities" ? <OpportunitiesDashboard /> :
    section === "what-if-lab" ? <WhatIfLab /> :
    section === "sense-roi" ? <SenseRoiPage /> :
    section === "verification" ? <VerificationPage /> :
    <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><Card><CardHeader><CardTitle>{item.label} workspace</CardTitle><CardDescription>The layout is ready for this module.</CardDescription></CardHeader><CardContent><EmptyState icon={Icon} title="Workspace ready" description="This section will populate when its data and workflows are connected." /></CardContent></Card><div className="space-y-5"><Card><CardHeader><CardTitle>At a glance</CardTitle><CardDescription>Module status</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between border-b border-[#edf1ee] pb-3 text-sm"><span className="text-[#66746b]">Data connection</span><Badge variant="neutral">Pending</Badge></div><div className="flex items-center justify-between pt-3 text-sm"><span className="text-[#66746b]">Mode</span><Badge variant="green">Simulation</Badge></div><p className="mt-5 text-[11px] text-[#87938b]">{DEMO_LABEL}</p></CardContent></Card>{["loss-detective", "what-if-lab", "verification", "sense-roi", "energy-audit", "reports"].includes(section) && <ChartContainer title="Analysis view" empty />}</div></div>}
  </>;
}
