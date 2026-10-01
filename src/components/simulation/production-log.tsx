"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_LABEL } from "@/lib/demo";

type Summary = {
  source: "SIMULATED";
  jobCount: number;
  daily: Array<{ day: string; factoryKwh: number; finishedGoodUnits: number; factorySec: number | null; peakDemandKw: number }>;
  kpis: { factorySecKwhPerFinishedGoodUnit: number; process: Array<{ code: string; jobs: number; kwhPerJob: number | null; kwhPerGoodComponent: number | null }>; compressorKwhPerProductiveFactoryHour: number; finishedGoodsRejectRate: number };
  jobs: Array<{ jobId: string; productId: string; productName: string; quantity: number; machine: string; plannedStart: string; actualStart: string; plannedEnd: string; actualEnd: string; goodUnits: number; rejectedUnits: number; shift: string; energyKwh: number; source: "SIMULATED" }>;
};
const datetime = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function ProductionLog() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/simulation", { cache: "no-store" }).then(async (response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Simulation unavailable");
    setSummary(body);
  }).catch((cause) => setError(cause instanceof Error ? cause.message : "Simulation unavailable")); }, []);
  if (error) return <Card><CardContent className="py-8 text-sm text-[#a36a18]">{error}</CardContent></Card>;
  if (!summary) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-72" /><Skeleton className="h-96" /></div>;
  const trend = summary.daily.map((row) => ({ ...row, label: new Date(row.day).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" }) }));
  return <div className="space-y-5">
    <div className="rounded-lg border border-[#dce7df] bg-[#f7faf8] px-4 py-3 text-xs text-[#64786b]">{DEMO_LABEL}. Thirty complete days at 5-minute resolution. Jobs, energy, units and SEC are generated from the same fictional production schedule.</div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Factory SEC", `${summary.kpis.factorySecKwhPerFinishedGoodUnit.toFixed(2)} kWh/good unit`],
      ["Compressor intensity", `${summary.kpis.compressorKwhPerProductiveFactoryHour.toFixed(1)} kWh/productive h`],
      ["Finished goods rejection", `${summary.kpis.finishedGoodsRejectRate.toFixed(1)}%`],
      ["Historical jobs", `${summary.jobCount} simulated jobs`]
    ].map(([label, value]) => <Card key={label}><CardContent className="pt-4"><div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#819087]">{label}</div><div className="mt-2 text-lg font-semibold text-[#26372d]">{value}</div><div className="mt-1 text-[10px] text-[#8b978f]">{DEMO_LABEL}</div></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Energy per finished good unit</CardTitle><CardDescription>Factory SEC · 30-day simulated history · kWh/good unit</CardDescription></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}><CartesianGrid vertical={false} stroke="#edf1ee" /><XAxis dataKey="label" tick={{ fontSize: 10 }} interval={5} /><YAxis tick={{ fontSize: 10 }} /><Tooltip contentStyle={{ border: "1px solid #e1e8e3", borderRadius: 8, fontSize: 11 }} /><Line dataKey="factorySec" name="kWh/good unit" stroke="#397d56" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Process energy intensity</CardTitle><CardDescription>Simulated production jobs · kWh per good component</CardDescription></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.kpis.process.map((item) => <div key={item.code} className="rounded-lg border border-[#e4ebe6] bg-[#fbfcfb] p-3"><div className="text-xs font-semibold text-[#405b49]">{item.code}</div><div className="mt-1 text-lg font-semibold text-[#26372d]">{item.kwhPerGoodComponent?.toFixed(2) ?? "—"}</div><div className="text-[11px] text-[#829087]">kWh/good component</div><div className="mt-2 text-[10px] text-[#829087]">{item.kwhPerJob?.toFixed(1) ?? "—"} kWh/job · {item.jobs} jobs</div></div>)}</div></CardContent></Card>
    <Card><CardHeader><CardTitle>Production jobs</CardTitle><CardDescription>Latest 36 historical jobs · planned and actual times in IST · {DEMO_LABEL}</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[1020px] text-left text-xs"><thead className="border-b border-[#e1e8e2] bg-[#f8faf8] text-[10px] uppercase tracking-[0.07em] text-[#7c8a80]"><tr>{["Job ID", "Product", "Machine", "Shift", "Planned", "Actual", "Quantity", "Good", "Rejected", "Energy"].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{summary.jobs.map((job) => <tr key={job.jobId} className="border-b border-[#edf1ee] text-[#53665a]"><td className="px-3 py-3 font-medium text-[#304736]">{job.jobId}</td><td className="px-3 py-3">{job.productName}</td><td className="px-3 py-3">{job.machine}</td><td className="px-3 py-3">{job.shift}</td><td className="px-3 py-3">{datetime(job.plannedStart)}</td><td className="px-3 py-3">{datetime(job.actualStart)}</td><td className="px-3 py-3">{job.quantity}</td><td className="px-3 py-3">{job.goodUnits}</td><td className="px-3 py-3">{job.rejectedUnits}</td><td className="px-3 py-3">{job.energyKwh.toFixed(1)} kWh</td></tr>)}</tbody></table></div></CardContent></Card>
  </div>;
}
