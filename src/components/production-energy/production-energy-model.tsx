"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, ArrowRight, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_LABEL } from "@/lib/demo";
import type { EnergyAssessment, PerformanceState } from "@/lib/production-energy/calculation";

type Response = {
  source: "SIMULATED";
  disclaimer: string;
  method: { baselineDays: number; minimumComparables: number; baseline: string; expected: string; residual: string; deviation: string };
  factory: EnergyAssessment | null;
  assets: EnergyAssessment[];
  recentJobs: EnergyAssessment[];
  factoryTrend: EnergyAssessment[];
};
const stateStyle: Record<PerformanceState, string> = {
  Normal: "border-[#cfe3d5] bg-[#eef6f0] text-[#387452]",
  Watch: "border-[#ead9b2] bg-[#fff8e9] text-[#946d26]",
  "Potential Loss": "border-[#e9cba3] bg-[#fff3df] text-[#98651c]",
  "Confirmed Opportunity": "border-[#e8bcb7] bg-[#fff0ed] text-[#a94f47]"
};
const number = (value: number | null, decimals = 1) => value === null ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
const signed = (value: number | null, suffix = "") => value === null ? "—" : `${value > 0 ? "+" : ""}${number(value)}${suffix}`;
const dayLabel = (date: string) => new Date(date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });

function StateBadge({ state }: { state: PerformanceState }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-semibold ${stateStyle[state]}`}>{state}</span>;
}
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="rounded-lg border border-[#e3eae5] bg-[#fbfcfb] p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#829087]">{label}</div><div className="mt-1.5 text-[17px] font-semibold tracking-[-0.02em] text-[#263a2d]">{value}</div>{note && <div className="mt-1 text-[10px] text-[#839187]">{note}</div>}</div>;
}
function Evidence({ assessment }: { assessment: EnergyAssessment }) {
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2"><StateBadge state={assessment.state} /><span className="text-xs text-[#77877b]">{assessment.equipmentCode} · {assessment.productId} · Shift {assessment.shift} · {dayLabel(assessment.at)}</span></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Metric label="Actual SEC" value={`${number(assessment.actualSec, 3)} kWh/${assessment.outputUnit}`} /><Metric label="Baseline SEC" value={`${number(assessment.baselineSec, 3)} kWh/${assessment.outputUnit}`} note={`${assessment.comparableCount} comparable healthy observations`} /><Metric label="Useful output" value={`${number(assessment.usefulOutput, 1)} ${assessment.outputUnit}${assessment.usefulOutput === 1 ? "" : "s"}`} /><Metric label="Actual energy" value={`${number(assessment.actualEnergyKwh)} kWh`} /><Metric label="Expected energy" value={`${number(assessment.expectedEnergyKwh)} kWh`} /><Metric label="Residual" value={`${signed(assessment.residualKwh, " kWh")}`} /></div>
    <div className="rounded-lg border border-[#e3eae5] p-4"><div className="flex items-center justify-between text-xs"><span className="font-semibold text-[#324639]">Classification evidence</span><span className="text-[#6c8172]">{Math.round(assessment.confidence * 100)}% confidence</span></div><ul className="mt-3 space-y-2">{assessment.reasons.map((reason, index) => <li key={index} className="flex gap-2 text-xs leading-5 text-[#63766a]"><ArrowRight size={13} className="mt-1 shrink-0 text-[#7e9b86]" />{reason}</li>)}</ul><div className="mt-3 border-t border-[#edf1ee] pt-3 text-[11px] text-[#819087]">Comparison: {assessment.comparisonLevel}. Residual is a statistical difference; action value needs engineering review and verification. {DEMO_LABEL}.</div></div>
  </div>;
}

export function ProductionEnergyModel() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"All" | PerformanceState>("All");
  const load = async () => {
    try {
      const response = await fetch("/api/production-energy", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Production energy model unavailable");
      setData(body); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Production energy model unavailable"); }
  };
  useEffect(() => { void load(); }, []);
  const assessments = useMemo(() => data ? [...(data.factory ? [data.factory] : []), ...data.assets, ...data.recentJobs] : [], [data]);
  const selected = assessments.find((item) => item.observationId === selectedId) ?? data?.factory ?? assessments[0] ?? null;
  const visibleAssets = data?.assets.filter((item) => filter === "All" || item.state === filter) ?? [];
  if (!data && !error) return <div className="space-y-5"><Skeleton className="h-24" /><Skeleton className="h-48" /><Skeleton className="h-96" /></div>;
  if (!data) return <Card><CardContent className="flex items-center gap-3 py-8 text-sm text-[#956a26]"><AlertCircle size={18} />{error}<Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw size={13} />Retry</Button></CardContent></Card>;
  const trend = data.factoryTrend.map((row) => ({ day: dayLabel(row.at), actual: row.actualSec, baseline: row.baselineSec }));
  return <div className="space-y-5">
    <div className="rounded-lg border border-[#dce7df] bg-[#f7faf8] px-4 py-3 text-xs leading-5 text-[#5f7466]">{DEMO_LABEL}. Energy is compared with useful production output and matched healthy history. A positive residual is an investigation signal, not automatically waste or savings.</div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Factory SEC" value={`${number(data.factory?.actualSec ?? null, 2)} kWh/good unit`} note="Latest complete simulated day" /><Metric label="Expected factory energy" value={`${number(data.factory?.expectedEnergyKwh ?? null)} kWh`} note="Median healthy SEC × finished good units" /><Metric label="Factory residual" value={signed(data.factory?.residualKwh ?? null, " kWh")} note="Actual minus expected" /><Metric label="Assessment confidence" value={`${Math.round((data.factory?.confidence ?? 0) * 100)}%`} note="Metering, sample size, comparability, spread" /></div>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Card><CardHeader><CardTitle>Factory energy intensity</CardTitle><CardDescription>Actual SEC versus comparable healthy baseline · kWh/finished good unit · {DEMO_LABEL}</CardDescription></CardHeader><CardContent><div className="h-[230px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}><CartesianGrid vertical={false} stroke="#edf1ee" /><XAxis dataKey="day" tick={{ fontSize: 10 }} interval={5} /><YAxis tick={{ fontSize: 10 }} /><Tooltip contentStyle={{ border: "1px solid #e1e8e3", borderRadius: 8, fontSize: 11 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Line name="Actual SEC" dataKey="actual" stroke="#397d56" strokeWidth={2} dot={false} /><Line name="Healthy baseline" dataKey="baseline" stroke="#889da7" strokeDasharray="4 3" strokeWidth={1.5} dot={false} /></LineChart></ResponsiveContainer></div></CardContent></Card><Card><CardHeader><CardTitle>How the model decides</CardTitle><CardDescription>Transparent statistical rules</CardDescription></CardHeader><CardContent className="space-y-3 text-xs leading-5 text-[#617368]"><p><strong className="text-[#334e3b]">1.</strong> Match healthy observations by equipment, product, shift, batch size and operating duration.</p><p><strong className="text-[#334e3b]">2.</strong> Use median SEC from at least {data.method.minimumComparables} observations. Expected energy = baseline SEC × useful output.</p><p><strong className="text-[#334e3b]">3.</strong> Compare actual and expected. Confidence reflects metering, sample count, context match and spread.</p><p><strong className="text-[#334e3b]">4.</strong> Escalate only after repeated deviations. Confirmation also needs an operating signal and a direct or feeder meter.</p><p className="border-t border-[#edf1ee] pt-3 text-[11px] text-[#88958d]">The first {data.method.baselineDays} simulated days form the healthy reference. Sparse or extrapolated comparisons remain Watch.</p></CardContent></Card></div>
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Equipment and process assessments</CardTitle><CardDescription>Latest complete simulated day · SEC uses each asset’s useful output</CardDescription></div><select aria-label="Filter assessments" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="h-9 rounded-md border border-[#dce5df] bg-white px-3 text-xs text-[#4e6557]"><option>All</option>{(["Normal", "Watch", "Potential Loss", "Confirmed Opportunity"] as const).map((state) => <option key={state}>{state}</option>)}</select></div></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="border-b border-[#e3eae5] bg-[#f8faf8] text-[10px] uppercase tracking-[0.06em] text-[#809087]"><tr>{["Equipment", "Output basis", "Actual SEC", "Baseline SEC", "Expected", "Residual", "Deviation", "Confidence", "State"].map((title) => <th key={title} className="px-3 py-3 font-semibold">{title}</th>)}</tr></thead><tbody>{visibleAssets.map((row) => <tr key={row.observationId} onClick={() => setSelectedId(row.observationId)} className={`cursor-pointer border-b border-[#edf1ee] hover:bg-[#f8faf8] ${selected?.observationId === row.observationId ? "bg-[#f5f9f6]" : ""}`}><td className="px-3 py-3 font-semibold text-[#304936]">{row.equipmentCode}</td><td className="px-3 py-3 text-[#718175]">kWh/{row.outputUnit}</td><td className="px-3 py-3">{number(row.actualSec, 2)}</td><td className="px-3 py-3">{number(row.baselineSec, 2)}</td><td className="px-3 py-3">{number(row.expectedEnergyKwh)} kWh</td><td className="px-3 py-3">{signed(row.residualKwh, " kWh")}</td><td className="px-3 py-3">{signed(row.deviationPercent, "%")}</td><td className="px-3 py-3">{Math.round(row.confidence * 100)}%</td><td className="px-3 py-3"><StateBadge state={row.state} /></td></tr>)}</tbody></table>{!visibleAssets.length && <p className="py-7 text-center text-xs text-[#87958b]">No assessments in this state.</p>}</div></CardContent></Card>
    {selected && <Card><CardHeader><CardTitle>Why this state?</CardTitle><CardDescription>Review the comparison and evidence before taking action</CardDescription></CardHeader><CardContent><Evidence assessment={selected} /></CardContent></Card>}
    <Card><CardHeader><CardTitle>Recent production jobs</CardTitle><CardDescription>Product, quantity, shift and duration matched against healthy jobs · {DEMO_LABEL}</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[790px] text-left text-xs"><thead className="border-b border-[#e3eae5] bg-[#f8faf8] text-[10px] uppercase tracking-[0.06em] text-[#809087]"><tr>{["Equipment", "Product", "Shift", "Actual", "Expected", "Residual", "Deviation", "Confidence", "State"].map((title) => <th key={title} className="px-3 py-3 font-semibold">{title}</th>)}</tr></thead><tbody>{data.recentJobs.slice(0, 24).map((row) => <tr key={row.observationId} onClick={() => setSelectedId(row.observationId)} className="cursor-pointer border-b border-[#edf1ee] hover:bg-[#f8faf8]"><td className="px-3 py-3 font-semibold text-[#304936]">{row.equipmentCode}</td><td className="px-3 py-3">{row.productId}</td><td className="px-3 py-3">{row.shift}</td><td className="px-3 py-3">{number(row.actualEnergyKwh)} kWh</td><td className="px-3 py-3">{number(row.expectedEnergyKwh)} kWh</td><td className="px-3 py-3">{signed(row.residualKwh, " kWh")}</td><td className="px-3 py-3">{signed(row.deviationPercent, "%")}</td><td className="px-3 py-3">{Math.round(row.confidence * 100)}%</td><td className="px-3 py-3"><StateBadge state={row.state} /></td></tr>)}</tbody></table></div></CardContent></Card>
  </div>;
}
