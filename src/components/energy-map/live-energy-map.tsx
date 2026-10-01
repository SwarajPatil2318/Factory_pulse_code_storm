"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { Activity, CircleAlert, CircleDollarSign, Crosshair, RefreshCw, Unplug, Zap } from "lucide-react";
import { EnergyDetailPanel } from "@/components/energy-map/energy-detail-panel";
import { EnergyNodeCard } from "@/components/energy-map/energy-node";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_LABEL } from "@/lib/demo";
import { formatInr, formatNumber, statusStyle } from "@/lib/energy-map/format";
import { buildEnergyFlow, filterEnergyNodes, type MapFlowNode } from "@/lib/energy-map/layout";
import type { EnergyMapSnapshot, EnergyMetric } from "@/lib/energy-map/types";

const nodeTypes = { energy: EnergyNodeCard };
const metrics: Array<{ id: EnergyMetric; label: string }> = [
  { id: "cost", label: "₹ Cost" }, { id: "power", label: "kW Power" },
  { id: "energy", label: "kWh Energy" }, { id: "sec", label: "SEC" }
];
const statuses = ["normal", "watch", "critical", "offline", "inferred"] as const;

function StatCard({ icon: Icon, label, value, note, accent = false }: { icon: typeof Zap; label: string; value: string; note: string; accent?: boolean }) {
  return <Card><CardContent className="flex min-h-[118px] flex-col justify-between pt-4 sm:pt-5"><div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#7d8b81]">{label}</span><Icon size={17} strokeWidth={1.8} className={accent ? "text-[#a36a18]" : "text-[#6c9277]"} /></div><div><div className={`mt-2 text-[23px] font-semibold tracking-[-0.035em] ${accent ? "text-[#a36a18]" : "text-[#26362c]"}`}>{value}</div><div className="mt-0.5 text-[11px] text-[#829087]">{note}</div></div></CardContent></Card>;
}

function FlowCanvas({ snapshot, areaFilter, statusFilter, metric, selectedId, measurementTargetId, onSelect, onClose }: { snapshot: EnergyMapSnapshot; areaFilter: string; statusFilter: string; metric: EnergyMetric; selectedId: string | null; measurementTargetId: string | null; onSelect: (id: string) => void; onClose: () => void }) {
  const { fitView, setCenter } = useReactFlow<MapFlowNode>();
  const focusedTarget = useRef<string | null>(null);
  const visibleIds = useMemo(() => filterEnergyNodes(snapshot, areaFilter, statusFilter), [snapshot, areaFilter, statusFilter]);
  const flow = useMemo(() => buildEnergyFlow(snapshot, visibleIds, metric, selectedId), [snapshot, visibleIds, metric, selectedId]);
  const selected = snapshot.nodes.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    if (!measurementTargetId || selectedId !== measurementTargetId || focusedTarget.current === measurementTargetId) return;
    const target = flow.nodes.find((node) => node.id === measurementTargetId);
    if (!target) return;
    focusedTarget.current = measurementTargetId;
    const timer = window.setTimeout(() => void setCenter(target.position.x + 290, target.position.y + 65, { zoom: .8, duration: 500 }), 450);
    return () => window.clearTimeout(timer);
  }, [measurementTargetId, selectedId, flow.nodes, setCenter]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => void fitView({ duration: 350, padding: 0.1, minZoom: 0.42, maxZoom: 1 }));
    return () => cancelAnimationFrame(frame);
  }, [areaFilter, statusFilter, fitView]);

  return <div className="relative h-[650px] overflow-hidden rounded-lg border border-[#e2e9e4] bg-[#fafcfb] sm:h-[720px]">
    <ReactFlow<MapFlowNode> nodes={flow.nodes} edges={flow.edges} nodeTypes={nodeTypes} onNodeClick={(_, node) => onSelect(node.id)} onPaneClick={onClose} fitView fitViewOptions={{ padding: 0.1, minZoom: 0.42, maxZoom: 1 }} minZoom={0.32} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} panOnDrag zoomOnScroll zoomOnPinch proOptions={{ hideAttribution: true }}>
      <Background color="#e6ede8" gap={24} size={1} /><Controls position="bottom-left" showInteractive={false} />
    </ReactFlow>
    <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-md border border-[#dce7df] bg-white/95 px-2.5 py-1.5 text-[10px] font-semibold text-[#466552] shadow-[0_1px_3px_rgba(24,39,33,.06)]"><span className="fp-live-dot h-1.5 w-1.5 rounded-full bg-[#3d9b62]" /> {snapshot.scenarioId ? "SIMULATED LIVE POWER · LC-01 SCENARIO" : "LIVE SIMULATION"}</div>
    <button onClick={() => void fitView({ duration: 400, padding: 0.1, minZoom: 0.42, maxZoom: 1 })} className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-[#dce7df] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#536a59] shadow-[0_1px_3px_rgba(24,39,33,.06)] hover:bg-[#f5f8f6]"><Crosshair size={13} /> Fit view</button>
    {visibleIds.size === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="rounded-lg border border-[#e2e9e4] bg-white px-5 py-4 text-sm text-[#738178]">No equipment matches these filters.</div></div>}
    {selected && <EnergyDetailPanel node={selected} snapshot={snapshot} onClose={onClose} onSelect={onSelect} />}
  </div>;
}

export function LiveEnergyMap() {
  const [snapshot, setSnapshot] = useState<EnergyMapSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [areaFilter, setAreaFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [metric, setMetric] = useState<EnergyMetric>("power");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [measurementCode, setMeasurementCode] = useState<string | null>(null);
  const appliedMeasurement = useRef(false);
  useEffect(() => { setMeasurementCode(new URLSearchParams(window.location.search).get("measure")); }, []);
  useEffect(() => {
    if (!snapshot || !measurementCode || appliedMeasurement.current) return;
    const target = snapshot.nodes.find((node) => node.code === measurementCode);
    if (!target) return;
    appliedMeasurement.current = true;
    setAreaFilter(""); setStatusFilter(""); setSelectedId(target.id);
  }, [snapshot, measurementCode]);
  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch("/api/energy-map", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Energy map could not be loaded.");
      setSnapshot(body as EnergyMapSnapshot); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Energy map could not be loaded."); }
    finally { if (initial) setLoading(false); }
  }, []);
  useEffect(() => {
    void load(true);
    const interval = window.setInterval(() => { if (!document.hidden) void load(); }, 4_000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (loading && !snapshot) return <div role="status" aria-label="Loading energy map" className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[118px]" />)}</div><Skeleton className="h-[710px]" /></div>;
  if (!snapshot) return <Card><CardContent className="flex flex-col items-center gap-4 py-16 text-center"><CircleAlert className="text-[#a36a18]" /><p className="text-sm text-[#607066]">{error ?? "Energy map could not be loaded."}</p><Button onClick={() => void load(true)}><RefreshCw size={15} /> Retry</Button></CardContent></Card>;

  const reference = snapshot.nodes.find((item) => item.id === snapshot.accountingReferenceId);
  const updatedAt = new Date(snapshot.simulatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard icon={Zap} label="Plant demand" value={`${formatNumber(snapshot.plantCurrentKw)} kW`} note="Current simulated draw" /><StatCard icon={Activity} label="Energy today" value={`${formatNumber(snapshot.plantTodayKwh)} kWh`} note={`${snapshot.productionUnitsToday} finished good units · SEC ${snapshot.factorySecKwhPerGoodUnit?.toFixed(2) ?? "—"} kWh/unit`} /><StatCard icon={CircleDollarSign} label="Cost today" value={formatInr(snapshot.plantCostTodayInr)} note={`Assumed tariff ₹${snapshot.tariffInrPerKwh}/kWh`} /><StatCard icon={Unplug} label="Unallocated energy" value={`${formatNumber(snapshot.unallocatedKwh)} kWh`} note={`${formatNumber(snapshot.unallocatedPercent)}% currently unattributed at ${reference?.code ?? "incomer"}`} accent /></div>

    {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-[#efd9ba] bg-[#fff8ec] px-4 py-3 text-xs text-[#9a6b2a]"><span>{error} Showing the last available simulation snapshot.</span><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw size={13} /> Retry</Button></div>}

    {measurementCode && snapshot.nodes.some((node) => node.code === measurementCode) && <div className="flex items-center gap-2 rounded-lg border border-[#cbded0] bg-[#f1f8f3] px-4 py-3 text-xs font-semibold text-[#35734e]">SenseROI measurement location: {measurementCode} branch. The target is selected below. · {DEMO_LABEL}</div>}
    <Card><CardContent className="pt-5 sm:pt-6"><div className="mb-4 flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="text-[16px] font-semibold tracking-[-0.025em] text-[#27382d]">Plant energy flow</h2><Badge variant="green">SIMULATION</Badge></div><p className="mt-1 text-xs text-[#7a897e]">Automatically generated from Factory Setup electrical connections · {DEMO_LABEL}</p></div><div className="flex items-center gap-2 text-[11px] text-[#8a978e]"><span className="fp-live-dot h-1.5 w-1.5 rounded-full bg-[#3d9b62]" /> Simulated factory time {updatedAt} IST · {snapshot.scenarioId ? "LC-01 fixed · other loads update every 4 s" : "5 minutes per update"}</div></div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><label className="text-xs text-[#6a786d]"><span className="sr-only">Filter by area</span><select value={areaFilter} onChange={(event) => { setAreaFilter(event.target.value); setSelectedId(null); }} className="h-9 min-w-[145px] rounded-lg border border-[#dce5df] bg-white px-3 text-xs font-medium text-[#52655a] outline-none"><option value="">All areas</option>{snapshot.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label className="text-xs text-[#6a786d]"><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setSelectedId(null); }} className="h-9 min-w-[145px] rounded-lg border border-[#dce5df] bg-white px-3 text-xs font-medium text-[#52655a] outline-none"><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{statusStyle[status].label}</option>)}</select></label></div><div className="flex rounded-lg border border-[#dce5df] bg-[#f7f9f7] p-0.5" role="group" aria-label="Node value display">{metrics.map((item) => <button key={item.id} aria-pressed={metric === item.id} onClick={() => setMetric(item.id)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${metric === item.id ? "bg-white text-[#27664d] shadow-[0_1px_2px_rgba(24,39,33,.08)]" : "text-[#748277] hover:text-[#405a46]"}`}>{item.label}</button>)}</div></div>
      <ReactFlowProvider><FlowCanvas snapshot={snapshot} areaFilter={areaFilter} statusFilter={statusFilter} metric={metric} selectedId={selectedId} measurementTargetId={measurementCode ? snapshot.nodes.find((node) => node.code === measurementCode)?.id ?? null : null} onSelect={setSelectedId} onClose={() => setSelectedId(null)} /></ReactFlowProvider>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#839087]"><div className="flex flex-wrap items-center gap-3">{statuses.map((key) => <span key={key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: statusStyle[key].dot }} />{statusStyle[key].label}</span>)}</div><span>Line width reflects energy flow · Scroll to zoom · Drag to pan</span></div>
    </CardContent></Card>
    <div className="rounded-lg border border-[#e1e8e2] bg-[#f9fbf9] px-4 py-3 text-xs leading-5 text-[#68796b]">{DEMO_LABEL}. Current power, energy, cost, SEC, anomalies, and confidence are generated for presentation. The graph structure and meter assignments come from Factory Setup. No live meter feed is connected.</div>
  </div>;
}
