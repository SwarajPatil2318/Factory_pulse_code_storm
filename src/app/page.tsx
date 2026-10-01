"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, CircleDollarSign, Gauge, Play, RefreshCw, RotateCcw, ShieldCheck, Zap } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { EnergyMapPreview } from "@/components/overview/energy-map-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_LABEL } from "@/lib/demo";
import { defaultConstraints, rankOpportunities, type Evidence, type ManagerConstraints, type Opportunity } from "@/lib/decision-engine/calculation";
import { summarizeOpportunities } from "@/lib/overview/summary";
import { calculateWhatIf, defaultWhatIfInputs } from "@/lib/what-if/calculation";
import type { WhatIfBaseline } from "@/lib/what-if/model";
import type { EnergyMapSnapshot } from "@/lib/energy-map/types";
import type { verifyMaterialStaging } from "@/lib/verification/calculation";
import { useWorkspaceStore } from "@/store/workspace-store";
import { LC01_SCENARIO_COOKIE } from "@/lib/simulation/lc01-demo-scenario";

type Verification = ReturnType<typeof verifyMaterialStaging>;
type OperatorInsight = { machineCode: string; group: string; categoryLabel: string; note: string | null; diagnosis: string; recommendation: string };
type OperatorResponse = { eventInsights: OperatorInsight[] };
const inr = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
const number = (value: number, digits = 0) => value.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const payback = (value: number) => !Number.isFinite(value) ? "No payback" : value === 0 ? "Immediate" : `${number(value, 1)} mo`;
const demoSteps = [
  { title: "Normal factory", section: "A healthy baseline is established from the simulated plant history.", href: "/live-energy-map", action: "Explore the energy map" },
  { title: "LC-01 excess idle appears", section: "Between-job idle rises while the production schedule remains active.", href: "/live-energy-map", action: "Inspect LC-01" },
  { title: "Loss Detective flags the issue", section: "Production-aware comparison identifies excess idle instead of judging total kWh alone.", href: "/loss-detective", action: "Open Loss Detective" },
  { title: "Operator reports material waiting", section: "Shop-floor context turns an unexplained gap into a material-staging delay.", href: "/operator-insights", action: "View operator context" },
  { title: "Root cause identified", section: "The next sheet batch was not staged before the current job finished.", href: "/operator-insights", action: "Review root cause" },
  { title: "Compare three actions", section: "Material staging, auto-standby, and replacement are assessed against the same manager constraints.", href: "/opportunities", action: "Open Opportunities" },
  { title: "Test the economics", section: "The What-If Lab compares energy benefit, capital cost, and payback at the same output.", href: "/what-if-lab", action: "Open What-If Lab" },
  { title: "Choose the next action", section: "FactoryPulse selects a practical no-CAPEX action before equipment replacement.", href: "/opportunities", action: "Review recommendation" },
  { title: "Verify the result", section: "A simulated after period checks SEC, throughput, quality, and adjusted-baseline savings.", href: "/verification", action: "View decision passport" }
] as const;

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `${url} unavailable`);
  return body as T;
}
function Kpi({ label, value, unit, note, icon: Icon, accent = false }: { label: string; value: string; unit?: string; note: string; icon: typeof Zap; accent?: boolean }) {
  return <Card><CardContent className="flex h-full min-h-[132px] flex-col justify-between pt-4 sm:pt-5"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#75877b]">{label}</span><Icon size={15} className={accent ? "text-[#3d8a5b]" : "text-[#82978a]"} strokeWidth={1.8} /></div><div><div className={`mt-3 flex flex-wrap items-baseline gap-1 text-[23px] font-semibold tracking-[-0.04em] ${accent ? "text-[#287149]" : "text-[#273b2e]"}`}>{value}{unit && <span className="text-[11px] font-medium tracking-normal text-[#76877b]">{unit}</span>}</div><p className="mt-1 text-[10px] leading-4 text-[#87968b]">{note}</p></div></CardContent></Card>;
}
function StoryGuide({ step, next, previous, reset, ranked, verification, operatorEvent, scenario }: { step: number; next: () => void; previous: () => void; reset: () => void; ranked: Opportunity[]; verification: Verification | null; operatorEvent: OperatorInsight | null; scenario: ReturnType<typeof calculateWhatIf> | null }) {
  const item = demoSteps[step];
  const comparisons = ["lc-staging", "lc-standby", "lc-replace"].map((id) => ranked.find((action) => action.id === id)).filter((action): action is Opportunity => Boolean(action));
  return <Card className="border-[#bfd7c5] bg-[#f8fbf8]"><CardContent className="pt-5 sm:pt-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#408358]"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#dceee1] text-xs">{step + 1}</span> Guided demo · Step {step + 1} of {demoSteps.length}</div><h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#294532]">{item.title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[#617667]">{item.section}</p></div><Badge variant="blue">Presentation state · {DEMO_LABEL}</Badge></div>
    {step === 3 && <div className="mt-4 rounded-lg border border-[#dfe9e1] bg-white px-4 py-3 text-xs leading-5 text-[#566f5e]"><strong className="text-[#3d7350]">Operator event:</strong> “Waiting for material.” {operatorEvent ? <span>{operatorEvent.diagnosis}. {operatorEvent.note ? `“${operatorEvent.note}”` : operatorEvent.recommendation}</span> : <span>Review the simulated operator log for the time-aligned reason.</span>}</div>}
    {step === 4 && operatorEvent && <div className="mt-4 rounded-lg border border-[#dfe9e1] bg-white px-4 py-3 text-xs leading-5 text-[#566f5e]"><strong className="text-[#3d7350]">Cause-linked action:</strong> {operatorEvent.recommendation}</div>}
    {step === 5 && <div className="mt-4 grid gap-2 sm:grid-cols-3">{comparisons.map((action) => <div key={action.id} className="rounded-lg border border-[#e0e9e2] bg-white px-3 py-2.5"><div className="text-[11px] font-semibold text-[#34513d]">{action.action}</div><div className="mt-1 text-[10px] text-[#748579]">{inr(action.annualRupeeSaving)}/yr · {inr(action.capexInr)} CAPEX · {payback(action.simplePaybackMonths)}</div></div>)}</div>}
    {step === 6 && scenario && <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-md border border-[#dbe7de] bg-white px-3 py-2 text-[#55705d]">Auto-standby: {number(scenario.optionB.annualEnergySavingKwh)} kWh/yr</span><span className="rounded-md border border-[#dbe7de] bg-white px-3 py-2 text-[#55705d]">Replacement: {number(scenario.optionC?.annualEnergySavingKwh ?? 0)} kWh/yr</span><span className="rounded-md border border-[#cfe3d4] bg-[#eaf5ed] px-3 py-2 font-semibold text-[#2d734b]">{number(scenario.recommendation.capturedPercent ?? 0, 1)}% benefit at {number(scenario.recommendation.capexPercent ?? 0, 2)}% CAPEX</span></div>}
    {step === 7 && ranked.find((action) => action.eligible) && <div className="mt-4 rounded-lg border border-[#d5e6d8] bg-white px-4 py-3 text-xs font-semibold text-[#39704a]">{ranked.find((action) => action.eligible)?.machine} · {ranked.find((action) => action.eligible)?.action} · {inr(ranked.find((action) => action.eligible)?.capexInr ?? 0)} CAPEX</div>}
    {step === 8 && verification && <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-md border border-[#d6e6d9] bg-white px-3 py-2 text-[#486f54]">{verification.before.usefulOutput} → {verification.after.usefulOutput} good jobs</span><span className="rounded-md border border-[#d6e6d9] bg-white px-3 py-2 text-[#486f54]">SEC −{number(verification.secImprovementPercent ?? 0, 1)}%</span><span className="rounded-md border border-[#d6e6d9] bg-white px-3 py-2 font-semibold text-[#2f784b]">{inr(verification.annualVerifiedRupees ?? 0)}/yr equivalent</span></div>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e0eae2] pt-4"><div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${demoSteps.length}`}>{demoSteps.map((_, index) => <span key={index} className={`h-1.5 w-6 rounded-full ${index <= step ? "bg-[#3e8a5b]" : "bg-[#dce7df]"}`} />)}</div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={previous} disabled={step === 0}><ChevronLeft size={13} /> Previous Step</Button><Button size="sm" variant="outline" asChild><Link href={item.href}>{item.action} <ArrowUpRight size={13} /></Link></Button>{step < demoSteps.length - 1 && <Button size="sm" onClick={next}>Next Step <ChevronRight size={13} /></Button>}<Button size="sm" variant="ghost" onClick={reset}><RotateCcw size={13} /> Reset Demo</Button></div></div><p className="mt-3 text-[10px] text-[#8a9b8d]">Guided markers tell the story; live KPI readings remain the current simulated snapshot.</p>
  </CardContent></Card>;
}

export default function OverviewPage() {
  const [snapshot, setSnapshot] = useState<EnergyMapSnapshot | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [operator, setOperator] = useState<OperatorResponse | null>(null);
  const [whatIf, setWhatIf] = useState<WhatIfBaseline | null>(null);
  const [constraints, setConstraints] = useState<ManagerConstraints>(defaultConstraints);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [demoStep, setDemoStep] = useState<number | null>(null);
  const [demoHydrated, setDemoHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const changeDemoStep = (step: number | null) => {
    document.cookie = `${LC01_SCENARIO_COOKIE}=${step !== null && step > 0 ? "on" : "off"}; Path=/; Max-Age=2592000; SameSite=Lax`;
    setDemoStep(step);
    setVersion((current) => current + 1);
  };
  useEffect(() => {
    const saved = sessionStorage.getItem("factorypulse-demo-step");
    if (saved !== null) {
      const step = Number(saved);
      if (Number.isInteger(step) && step >= 0 && step < demoSteps.length) setDemoStep(step);
    }
    setDemoHydrated(true);
  }, []);
  useEffect(() => {
    if (!demoHydrated) return;
    if (demoStep === null) sessionStorage.removeItem("factorypulse-demo-step");
    else sessionStorage.setItem("factorypulse-demo-step", String(demoStep));
  }, [demoStep, demoHydrated]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("factorypulse-manager-constraints");
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<ManagerConstraints>;
      setConstraints({
        ...defaultConstraints,
        maxCapexInr: Number.isFinite(parsed.maxCapexInr) && (parsed.maxCapexInr ?? -1) >= 0 ? parsed.maxCapexInr! : defaultConstraints.maxCapexInr,
        preferredPaybackMonths: Number.isFinite(parsed.preferredPaybackMonths) && (parsed.preferredPaybackMonths ?? -1) >= 0 ? parsed.preferredPaybackMonths! : defaultConstraints.preferredPaybackMonths,
        tariffInrPerKwh: Number.isFinite(parsed.tariffInrPerKwh) && (parsed.tariffInrPerKwh ?? -1) >= 0 ? parsed.tariffInrPerKwh! : defaultConstraints.tariffInrPerKwh,
        minimumProduction: parsed.minimumProduction === "allow-trial-reduction" ? "allow-trial-reduction" : "current-baseline",
        quality: parsed.quality === "allow-validated-trial" ? "allow-validated-trial" : "no-rejection-increase",
        riskTolerance: ["Low", "Medium", "High"].includes(parsed.riskTolerance ?? "") ? parsed.riskTolerance! : defaultConstraints.riskTolerance
      });
    } catch { /* Ignore invalid local demo preferences. */ }
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.allSettled([
      readJson<EnergyMapSnapshot>("/api/energy-map"),
      readJson<{ evidence: Evidence[] }>("/api/opportunities"),
      readJson<Verification>("/api/verification"),
      readJson<OperatorResponse>("/api/operator-insights"),
      readJson<WhatIfBaseline>("/api/what-if"),
      readJson<{ factory: Parameters<ReturnType<typeof useWorkspaceStore.getState>["setFactoryProfile"]>[0] }>("/api/factory-model")
    ]).then(([mapResult, opportunityResult, verificationResult, operatorResult, whatIfResult, factoryResult]) => {
      if (!active) return;
      if (mapResult.status === "fulfilled") { setSnapshot(mapResult.value); setSelectedId((current) => current ?? mapResult.value.nodes.find((node) => node.code === "LC-01")?.id ?? null); }
      if (opportunityResult.status === "fulfilled") setEvidence(opportunityResult.value.evidence);
      if (verificationResult.status === "fulfilled") setVerification(verificationResult.value);
      if (operatorResult.status === "fulfilled") setOperator(operatorResult.value);
      if (whatIfResult.status === "fulfilled") setWhatIf(whatIfResult.value);
      if (factoryResult.status === "fulfilled") useWorkspaceStore.getState().setFactoryProfile(factoryResult.value.factory);
      setNotice([mapResult, opportunityResult, verificationResult, operatorResult, whatIfResult].some((item) => item.status === "rejected") ? "Some demo summaries are temporarily unavailable. Available results are shown below." : null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [version]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void readJson<EnergyMapSnapshot>("/api/energy-map").then(setSnapshot).catch(() => {}); }, 8_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (demoStep === null || !snapshot) return;
    const code = demoStep === 0 ? "M-01" : "LC-01";
    setSelectedId(snapshot.nodes.find((node) => node.code === code)?.id ?? null);
  }, [demoStep, snapshot?.nodes.length]);
  const ranked = useMemo(() => rankOpportunities(evidence, demoStep === null ? constraints : defaultConstraints), [evidence, constraints, demoStep]);
  const summary = useMemo(() => summarizeOpportunities(ranked), [ranked]);
  const scenario = useMemo(() => whatIf ? calculateWhatIf(whatIf, defaultWhatIfInputs(whatIf)) : null, [whatIf]);
  const materialEvent = operator?.eventInsights.find((item) => item.machineCode === "LC-01" && (item.group === "Material waiting" || item.categoryLabel.toLowerCase().includes("material"))) ?? null;
  const revealDiagnosis = demoStep === null || demoStep >= 2;
  const revealVerification = demoStep === null || demoStep >= 8;
  const best = revealDiagnosis ? summary.best : null;
  const verified = revealVerification && verification?.status === "VERIFIED" ? verification : null;
  return <>
    <PageHeading eyebrow="Industrial energy decision intelligence" title="Factory overview" description="Energy used, loss found, next action, and savings proved in one view." action={<div className="flex flex-wrap items-center gap-2"><Badge variant="blue">{DEMO_LABEL}</Badge><Button onClick={() => changeDemoStep(0)}><Play size={14} fill="currentColor" /> Run Demo</Button></div>} />
    {demoStep !== null && <div className="mb-5"><StoryGuide step={demoStep} next={() => changeDemoStep(Math.min(demoSteps.length - 1, demoStep + 1))} previous={() => changeDemoStep(Math.max(0, demoStep - 1))} reset={() => changeDemoStep(null)} ranked={ranked} verification={verification} operatorEvent={materialEvent} scenario={scenario} /></div>}
    {notice && <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#eadbbd] bg-[#fffaf0] px-4 py-3 text-xs text-[#8b6832]"><span>{notice}</span><Button size="sm" variant="outline" onClick={() => setVersion((current) => current + 1)}><RefreshCw size={13} /> Retry</Button></div>}
    {loading && !snapshot ? <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-32" />)}</div><Skeleton className="h-14" /><div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><Skeleton className="h-[440px]" /><Skeleton className="h-[440px]" /></div></div> : !snapshot ? <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><CircleAlert size={22} className="text-[#aa742d]" /><p className="text-sm text-[#68796c]">Live simulated snapshot unavailable. The rest of the demo is ready to retry.</p><Button size="sm" onClick={() => setVersion((current) => current + 1)}><RotateCcw size={13} /> Retry Overview</Button></CardContent></Card> : <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"><Kpi label="Live demand" value={number(snapshot.plantCurrentKw, 1)} unit="kW" note="Current simulated draw" icon={Gauge} /><Kpi label="Energy today" value={number(snapshot.plantTodayKwh)} unit="kWh" note="From main incomer" icon={Zap} /><Kpi label="Energy cost today" value={inr(snapshot.plantCostTodayInr)} note={`At map tariff ₹${snapshot.tariffInrPerKwh}/kWh`} icon={CircleDollarSign} /><Kpi label="Factory SEC" value={snapshot.factorySecKwhPerGoodUnit === null ? "—" : number(snapshot.factorySecKwhPerGoodUnit, 2)} unit="kWh / unit" note={snapshot.factorySecKwhPerGoodUnit === null ? "Awaiting finished units" : `${snapshot.productionUnitsToday} finished good units`} icon={Gauge} /><Kpi label="Identified opportunity" value={revealDiagnosis && evidence.length ? inr(summary.identifiedAnnualInr) : "—"} unit="/ year" note={revealDiagnosis ? "One feasible action per machine" : "Revealed after diagnosis"} icon={ArrowUpRight} accent /><Kpi label="Verified savings" value={verified ? inr(verified.annualVerifiedRupees ?? 0) : "—"} unit="/ year" note={revealVerification ? "Annualized simulated verification" : "Revealed after intervention"} icon={ShieldCheck} accent /></div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e0e9e2] bg-white px-4 py-3 text-xs"><div className="flex flex-wrap items-center gap-2"><span className="font-bold uppercase tracking-[0.06em] text-[#7b8c80]">{revealDiagnosis ? "Biggest recoverable candidate" : "Current demo state"}</span><span className="font-semibold text-[#366848]">{revealDiagnosis && summary.largestAnnual ? `${summary.largestAnnual.machine} · ${summary.largestAnnual.issue} · ${inr(summary.largestAnnual.annualRupeeSaving)}/year` : revealDiagnosis ? "Loading assessed opportunities" : "Healthy baseline under observation"}</span></div><Badge variant="blue">{revealDiagnosis ? "Candidate" : "Baseline"} · {DEMO_LABEL}</Badge></div>
      <div className="grid items-stretch gap-5 xl:grid-cols-[1.3fr_.7fr]"><Card><CardHeader className="flex-row flex-wrap items-start justify-between gap-2"><div><CardTitle>Energy map preview</CardTitle><CardDescription className="mt-1">Core plant flow from Factory Setup · click a node for detail · {DEMO_LABEL}</CardDescription></div><Link href="/live-energy-map" className="inline-flex items-center gap-1 text-xs font-semibold text-[#377b52] hover:underline">Full map <ArrowUpRight size={13} /></Link></CardHeader><CardContent><div className="mb-3 flex flex-wrap gap-2 text-[10px]"><span className={`rounded-md border px-2 py-1 font-semibold ${demoStep === 0 ? "border-[#dce6df] bg-[#f6f9f7] text-[#667e70]" : demoStep === 1 ? "border-[#efdcb8] bg-[#fff8e8] text-[#9d6b23]" : "border-[#c9e0d0] bg-[#edf7ef] text-[#2d794e]"}`}>LC-01 · {demoStep === 0 ? "Normal" : demoStep === 1 ? "Watch" : "Opportunity"}</span><span className={`rounded-md border px-2 py-1 font-semibold ${demoStep === 0 || demoStep === 1 ? "border-[#dce6df] bg-[#f6f9f7] text-[#667e70]" : "border-[#efdcb8] bg-[#fff8e8] text-[#9d6b23]"}`}>AC-01 · {demoStep === 0 || demoStep === 1 ? "Normal" : "Watch"}</span><span className={`rounded-md border px-2 py-1 font-semibold ${demoStep === 0 || demoStep === 1 ? "border-[#dce6df] bg-[#f6f9f7] text-[#667e70]" : "border-[#efdcb8] bg-[#fff8e8] text-[#9d6b23]"}`}>PC-01 · {demoStep === 0 || demoStep === 1 ? "Normal" : "Watch"}</span></div><EnergyMapPreview snapshot={snapshot} selectedId={selectedId} onSelect={setSelectedId} demoStep={demoStep} /></CardContent></Card>
        <Card className="border-[#cadfce] bg-[#fcfdfc]"><CardHeader><div className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#458159]">{revealDiagnosis ? "FactoryPulse recommends" : "FactoryPulse observes"}</div><CardTitle className="mt-2 text-[21px] leading-7 tracking-[-0.035em] text-[#2a4833]">{best ? `${best.action} on ${best.machine} before considering equipment replacement.` : revealDiagnosis ? "Action recommendation loading" : demoStep === 0 ? "Normal factory baseline" : "LC-01 idle windows under review"}</CardTitle><CardDescription className="mt-2">{best?.rationale ?? (revealDiagnosis ? "The ranked decision will appear when diagnosis is ready." : "Follow the guided steps to reveal the diagnosis and recommended action.")}</CardDescription></CardHeader><CardContent><div className="grid grid-cols-2 gap-2"><div className="rounded-lg border border-[#dce8df] bg-white p-3"><div className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#84968a]">Expected saving</div><div className="mt-1.5 text-lg font-semibold text-[#2b754b]">{best ? inr(best.annualRupeeSaving) : "—"}</div><div className="text-[10px] text-[#8d9a8f]">per year · illustrative</div></div><div className="rounded-lg border border-[#dce8df] bg-white p-3"><div className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#84968a]">CAPEX</div><div className="mt-1.5 text-lg font-semibold text-[#304b39]">{best ? inr(best.capexInr) : "—"}</div><div className="text-[10px] text-[#8d9a8f]">{best ? payback(best.simplePaybackMonths) : "—"} payback</div></div><div className="rounded-lg border border-[#dce8df] bg-white p-3"><div className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#84968a]">Confidence</div><div className="mt-1.5 text-lg font-semibold text-[#304b39]">{best ? `${Math.round(best.diagnosticConfidence * 100)}%` : "—"}</div><div className="text-[10px] text-[#8d9a8f]">Action-adjusted diagnosis</div></div><div className="rounded-lg border border-[#dce8df] bg-white p-3"><div className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#84968a]">Production impact</div><div className="mt-1.5 text-[11px] font-semibold leading-4 text-[#4c7157]">{best?.productionImpact ?? "—"}</div></div></div>{revealDiagnosis && <Button size="sm" asChild className="mt-4 w-full"><Link href="/opportunities">Why this action? <ArrowRight size={13} /></Link></Button>}</CardContent></Card></div>
      <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><Card><CardHeader className="flex-row flex-wrap items-start justify-between gap-2"><div><CardTitle>Top opportunities</CardTitle><CardDescription className="mt-1">Three highest ranked feasible actions on distinct machines · {DEMO_LABEL}</CardDescription></div><Link href="/opportunities" className="inline-flex items-center gap-1 text-xs font-semibold text-[#377b52] hover:underline">All options <ArrowUpRight size={13} /></Link></CardHeader><CardContent><div className="space-y-2">{revealDiagnosis && summary.topThree.length ? summary.topThree.map((action, index) => <div key={action.id} className="grid gap-3 rounded-lg border border-[#e5ebe6] bg-[#fbfcfb] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="flex min-w-0 gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#edf4ee] text-xs font-bold text-[#4a7956]">{index + 1}</span><div className="min-w-0"><div className="truncate text-xs font-semibold text-[#334f3b]">{action.machine} · {action.action}</div><div className="mt-1 text-[10px] text-[#839187]">{action.issue}</div></div></div><div className="grid min-w-0 grid-cols-2 gap-2 text-left text-[10px] sm:min-w-[340px] sm:grid-cols-4 sm:text-right"><div><span className="block text-[#8d9a90]">₹ / year</span><strong className="text-[11px] text-[#34714b]">{inr(action.annualRupeeSaving)}</strong></div><div><span className="block text-[#8d9a90]">CAPEX</span><strong className="text-[11px] text-[#415c49]">{inr(action.capexInr)}</strong></div><div><span className="block text-[#8d9a90]">Payback</span><strong className="text-[11px] text-[#415c49]">{payback(action.simplePaybackMonths)}</strong></div><div><span className="block text-[#8d9a90]">Confidence</span><strong className="text-[11px] text-[#415c49]">{Math.round(action.diagnosticConfidence * 100)}%</strong></div></div></div>) : <div className="rounded-lg border border-dashed border-[#dce5de] px-4 py-8 text-center text-xs text-[#8b9b8f]">{revealDiagnosis ? "No action currently clears manager constraints." : "Ranked actions appear after Loss Detective flags the issue."}</div>}</div><p className="mt-3 text-[10px] leading-4 text-[#8b998e]">Alternatives on the same machine are excluded from this summary total. Savings are estimates until verified.</p></CardContent></Card>
        <Card><CardHeader><div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#428457]" /><CardTitle>Verified improvement</CardTitle></div><CardDescription>Adjusted-baseline LC-01 comparison · {DEMO_LABEL}</CardDescription></CardHeader><CardContent>{verified ? <><div className="rounded-lg border border-[#d5e7d9] bg-[#f3f9f4] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#4b805a]">1 intervention verified</div><div className="mt-1 text-sm font-semibold text-[#355d40]">LC-01 material staging</div></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg border border-[#e4ebe5] p-3"><div className="text-[10px] text-[#89998d]">SEC improved</div><div className="mt-1 text-xl font-semibold text-[#2d754b]">{number(verified.secImprovementPercent ?? 0, 1)}%</div></div><div className="rounded-lg border border-[#e4ebe5] p-3"><div className="text-[10px] text-[#89998d]">Annualized saving</div><div className="mt-1 text-xl font-semibold text-[#2d754b]">{inr(verified.annualVerifiedRupees ?? 0)}</div></div></div><p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[#4b8059]"><CheckCircle2 size={13} /> Production and quality preserved</p><Button size="sm" variant="outline" asChild className="mt-4 w-full"><Link href="/verification">View verification and passport <ArrowUpRight size={13} /></Link></Button></> : <div className="rounded-lg border border-dashed border-[#dce5de] px-4 py-8 text-center text-xs text-[#89998d]">{revealVerification ? "Verification summary unavailable." : "The post-intervention result appears in Step 9."}</div>}</CardContent></Card></div>
      <div className="text-[11px] leading-5 text-[#89978c]">{DEMO_LABEL}. Pragati AutoFab Pvt. Ltd. is fictional. Opportunity values use the default manager constraints during the guided demo; live power and energy come from the accelerated simulation. Predicted savings are illustrative, and verified savings are generated post-intervention demo data.</div>
    </div>}
  </>;
}
