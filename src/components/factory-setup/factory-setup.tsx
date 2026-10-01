"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cable, CircleAlert, Factory, Gauge, Link2, Pencil, Plus, Radio, RefreshCw, Search, Trash2, Unplug } from "lucide-react";
import { FactoryEditor, type EditorState } from "@/components/factory-setup/factory-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEMO_LABEL } from "@/lib/demo";
import { meteringLabels, type FactoryModel, type ModelCommand } from "@/lib/factory-model/schema";
import { useWorkspaceStore } from "@/store/workspace-store";

type Tab = "topology" | "equipment" | "meters" | "structure" | "factory";
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "topology", label: "Connections" }, { id: "equipment", label: "Equipment" },
  { id: "meters", label: "Meters & sensors" }, { id: "structure", label: "Areas & lines" },
  { id: "factory", label: "Factory profile" }
];

function coverage(mode: string) {
  const variant = mode === "DIRECT_METER" ? "green" : mode === "FEEDER_METER" ? "blue" : mode === "UNMETERED" ? "warning" : "neutral";
  return <Badge variant={variant}>{meteringLabels[mode as keyof typeof meteringLabels] ?? mode}</Badge>;
}

export function FactorySetup() {
  const [model, setModel] = useState<FactoryModel | null>(null);
  const [tab, setTab] = useState<Tab>("topology");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/factory-model", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Factory model could not be loaded.");
      setModel(body as FactoryModel);
      useWorkspaceStore.getState().setFactoryProfile(body.factory);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Factory model could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const execute = async (command: ModelCommand, message = "Changes saved") => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/factory-model", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Changes could not be saved.");
      setModel(body as FactoryModel); useWorkspaceStore.getState().setFactoryProfile(body.factory); setEditor(null); setNotice(message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Changes could not be saved."); }
    finally { setBusy(false); }
  };

  const remove = (command: ModelCommand, label: string) => {
    if (window.confirm(`Delete ${label}? This changes the demo factory model.`)) void execute(command, `${label} deleted`);
  };

  const byId = useMemo(() => new Map(model?.equipment.map((item) => [item.id, item]) ?? []), [model]);
  const meterById = useMemo(() => new Map(model?.meters.map((item) => [item.id, item]) ?? []), [model]);
  const areaById = useMemo(() => new Map(model?.areas.map((item) => [item.id, item]) ?? []), [model]);
  const hierarchy = useMemo(() => {
    if (!model) return [];
    const result: Array<{ item: FactoryModel["equipment"][number]; depth: number }> = [];
    const visited = new Set<string>();
    const walk = (parentId: string | null, depth: number) => {
      for (const item of model.equipment.filter((candidate) => candidate.parentFeederId === parentId)) {
        if (visited.has(item.id)) continue;
        visited.add(item.id); result.push({ item, depth }); walk(item.id, depth + 1);
      }
    };
    walk(null, 0);
    for (const item of model.equipment) if (!visited.has(item.id)) result.push({ item, depth: 0 });
    return result;
  }, [model]);

  if (loading && !model) return <div role="status" aria-label="Loading factory setup" className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-12" /><Skeleton className="h-[430px]" /></div>;
  if (!model) return <Card><CardContent className="flex flex-col items-center gap-4 py-14 text-center"><CircleAlert className="text-[#a36a18]" /><p className="text-sm text-[#59695f]">{error ?? "Factory model could not be loaded."}</p><Button onClick={() => void load()}><RefreshCw size={15} /> Retry</Button></CardContent></Card>;

  return <div className="space-y-5">
    <Card><CardContent className="flex flex-wrap items-center gap-4 pt-5 sm:pt-6"><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#e8f1ec] text-[#27664d]"><Factory size={21} /></div><div className="min-w-0 flex-1"><h2 className="text-[17px] font-semibold tracking-[-0.02em]">{model.factory.name}</h2><p className="mt-1 text-xs text-[#75837a]">{model.factory.city}, {model.factory.state} <span className="mx-1">·</span> {DEMO_LABEL}</p></div><Badge variant="green">Factory model</Badge></CardContent></Card>
    <div className="flex flex-wrap gap-1 rounded-lg border border-[#e1e8e3] bg-white p-1.5" role="tablist" aria-label="Factory setup sections">{tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); setError(null); setNotice(null); }} className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${tab === item.id ? "bg-[#e8f1ec] text-[#27664d]" : "text-[#637269] hover:bg-[#f4f7f5]"}`}>{item.label}</button>)}</div>
    {error && <div role="alert" className="rounded-lg border border-[#f0d6c5] bg-[#fff8f0] px-4 py-3 text-sm text-[#9a572e]">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-[#d3e6d9] bg-[#f0f7f2] px-4 py-3 text-sm text-[#28684b]">{notice}</div>}

    {tab === "topology" && <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Electrical hierarchy</CardTitle><CardDescription className="mt-1">Upstream supply and feeder relationships. No energy readings are shown.</CardDescription></div><Button size="sm" onClick={() => setEditor({ kind: "connection" })}><Link2 size={14} /> Connect</Button></CardHeader><CardContent><div className="overflow-hidden rounded-lg border border-[#e5ebe7]"><Table><TableHeader><TableRow><TableHead>Equipment</TableHead><TableHead>Coverage</TableHead></TableRow></TableHeader><TableBody>{hierarchy.map(({ item, depth }) => <TableRow key={item.id}><TableCell><div className="flex items-center gap-2" style={{ paddingLeft: Math.min(depth, 4) * 15 }}><span className="text-[#9aaa9f]">{depth > 0 ? "└" : ""}</span><span className="font-semibold text-[#2e4235]">{item.code}</span><span className="hidden text-xs text-[#7b8980] sm:inline">{item.name}</span></div></TableCell><TableCell>{coverage(item.meteringMode)}</TableCell></TableRow>)}</TableBody></Table></div><p className="mt-4 text-xs text-[#829087]">{DEMO_LABEL}</p></CardContent></Card>
      <div className="space-y-5"><Card><CardHeader><CardTitle>Electrical connections</CardTitle><CardDescription>One upstream electrical supply per target.</CardDescription></CardHeader><CardContent><div className="max-h-[350px] space-y-2 overflow-y-auto">{model.electricalConnections.map((edge) => <div key={edge.id} className="flex items-center gap-2 rounded-lg border border-[#e6ece8] px-3 py-2 text-xs"><Cable size={14} className="shrink-0 text-[#6b8775]" /><span className="min-w-0 flex-1 truncate"><strong>{byId.get(edge.sourceEquipmentId)?.code}</strong> → <strong>{byId.get(edge.targetEquipmentId)?.code}</strong></span><button aria-label={`Disconnect ${byId.get(edge.sourceEquipmentId)?.code} from ${byId.get(edge.targetEquipmentId)?.code}`} className="text-[#9b746c] hover:text-[#b54742]" onClick={() => remove({ action: "connection.delete", id: edge.id, kind: "electrical" }, "connection")}><Unplug size={14} /></button></div>)}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Process connections</CardTitle><CardDescription>Material or service flow between equipment.</CardDescription></CardHeader><CardContent>{model.processConnections.length ? <div className="space-y-2">{model.processConnections.map((edge) => <div key={edge.id} className="flex items-center justify-between rounded-lg border border-[#e6ece8] px-3 py-2 text-xs"><span>{byId.get(edge.sourceEquipmentId)?.code} → {byId.get(edge.targetEquipmentId)?.code}</span><button aria-label="Delete process connection" className="text-[#9b746c] hover:text-[#b54742]" onClick={() => remove({ action: "connection.delete", id: edge.id, kind: "process" }, "process connection")}><Trash2 size={14} /></button></div>)}</div> : <p className="text-sm text-[#829087]">No process connections defined.</p>}</CardContent></Card></div>
    </div>}

    {tab === "equipment" && <Card><CardHeader className="flex-row flex-wrap items-start justify-between gap-3"><div><CardTitle>Equipment register</CardTitle><CardDescription className="mt-1">Physical assets, electrical parents, and instrumentation coverage.</CardDescription></div><Button size="sm" onClick={() => setEditor({ kind: "equipment" })}><Plus size={14} /> Add equipment</Button></CardHeader><CardContent><div className="mb-4 flex max-w-sm items-center gap-2 rounded-lg border border-[#dfe7e1] px-3 py-2 text-[#829087]"><Search size={15} /><input aria-label="Search equipment" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, name or type" className="w-full border-0 bg-transparent text-sm text-[#2c3b31] outline-none placeholder:text-[#a1aba4]" /></div><div className="overflow-hidden rounded-lg border border-[#e5ebe7]"><Table><TableHeader><TableRow><TableHead>Equipment</TableHead><TableHead>Type / area</TableHead><TableHead>Parent</TableHead><TableHead>Metering</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{model.equipment.filter((item) => `${item.code} ${item.name} ${item.equipmentType}`.toLowerCase().includes(query.toLowerCase())).map((item) => <TableRow key={item.id}><TableCell><div className="font-semibold">{item.code}</div><div className="mt-0.5 text-xs text-[#839087]">{item.name}</div></TableCell><TableCell><div className="capitalize">{item.equipmentType}</div><div className="mt-0.5 text-xs text-[#839087]">{areaById.get(item.areaId ?? "")?.name ?? "No area"}</div></TableCell><TableCell className="text-xs">{byId.get(item.parentFeederId ?? "")?.code ?? "—"}</TableCell><TableCell><div className="space-y-1">{coverage(item.meteringMode)}{item.meterId && <div className="text-[11px] text-[#7c8a80]">{meterById.get(item.meterId)?.code}</div>}</div></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Edit equipment" aria-label={`Edit ${item.code}`} onClick={() => setEditor({ kind: "equipment", id: item.id })}><Pencil size={15} /></Button><Button variant="ghost" size="icon" title="Mark unmetered" aria-label={`Mark ${item.code} unmetered`} onClick={() => void execute({ action: "equipment.unmeter", id: item.id }, `${item.code} marked unmetered`)}><Gauge size={15} /></Button><Button variant="ghost" size="icon" title="Delete equipment" aria-label={`Delete ${item.code}`} onClick={() => remove({ action: "equipment.delete", id: item.id }, item.code)}><Trash2 size={15} /></Button></div></TableCell></TableRow>)}</TableBody></Table></div><p className="mt-4 text-xs text-[#829087]">{DEMO_LABEL}</p></CardContent></Card>}

    {tab === "meters" && <div className="grid gap-5"><Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Meters</CardTitle><CardDescription className="mt-1">Assign a meter to a feeder or a specific equipment item.</CardDescription></div><Button size="sm" onClick={() => setEditor({ kind: "meter" })}><Plus size={14} /> Add meter</Button></CardHeader><CardContent><div className="overflow-hidden rounded-lg border border-[#e5ebe7]"><Table><TableHeader><TableRow><TableHead>Meter</TableHead><TableHead>Type</TableHead><TableHead>Measures</TableHead><TableHead>Sample interval</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{model.meters.map((meter) => <TableRow key={meter.id}><TableCell><div className="font-semibold">{meter.code}</div><div className="mt-0.5 text-xs text-[#839087]">{meter.name}</div></TableCell><TableCell className="capitalize">{meter.type}</TableCell><TableCell>{model.equipment.find((item) => item.meterId === meter.id)?.code ?? <Badge variant="neutral">Unassigned</Badge>}</TableCell><TableCell>{meter.sampleIntervalSeconds ? `${meter.sampleIntervalSeconds} s` : "—"}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Assign meter" aria-label={`Assign ${meter.code}`} onClick={() => setEditor({ kind: "assign", id: meter.id })}><Link2 size={15} /></Button><Button variant="ghost" size="icon" title="Edit meter" aria-label={`Edit ${meter.code}`} onClick={() => setEditor({ kind: "meter", id: meter.id })}><Pencil size={15} /></Button><Button variant="ghost" size="icon" title="Delete meter" aria-label={`Delete ${meter.code}`} onClick={() => remove({ action: "meter.delete", id: meter.id }, meter.code)}><Trash2 size={15} /></Button></div></TableCell></TableRow>)}</TableBody></Table></div><p className="mt-4 text-xs text-[#829087]">Meter reading fields are available in the model. No readings are seeded. {DEMO_LABEL}</p></CardContent></Card>
      <Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Sensors</CardTitle><CardDescription className="mt-1">Non-meter sensors linked to equipment.</CardDescription></div><Button size="sm" variant="outline" onClick={() => setEditor({ kind: "sensor" })}><Plus size={14} /> Add sensor</Button></CardHeader><CardContent>{model.sensors.length ? <div className="overflow-hidden rounded-lg border border-[#e5ebe7]"><Table><TableHeader><TableRow><TableHead>Sensor</TableHead><TableHead>Type</TableHead><TableHead>Equipment</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{model.sensors.map((sensor) => <TableRow key={sensor.id}><TableCell><strong>{sensor.code}</strong><div className="text-xs text-[#839087]">{sensor.name}</div></TableCell><TableCell>{sensor.sensorType}</TableCell><TableCell>{byId.get(sensor.equipmentId ?? "")?.code ?? "—"}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label={`Edit ${sensor.code}`} onClick={() => setEditor({ kind: "sensor", id: sensor.id })}><Pencil size={15} /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${sensor.code}`} onClick={() => remove({ action: "sensor.delete", id: sensor.id }, sensor.code)}><Trash2 size={15} /></Button></div></TableCell></TableRow>)}</TableBody></Table></div> : <div className="flex items-center gap-3 rounded-lg border border-dashed border-[#dae4dd] bg-[#fbfcfb] p-5 text-sm text-[#7e8c82]"><Radio size={19} /> No sensors defined yet.</div>}</CardContent></Card></div>}

    {tab === "structure" && <div className="grid gap-5 xl:grid-cols-2"><Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Areas</CardTitle><CardDescription className="mt-1">Physical factory zones.</CardDescription></div><Button size="sm" onClick={() => setEditor({ kind: "area" })}><Plus size={14} /> Add area</Button></CardHeader><CardContent><div className="space-y-2">{model.areas.map((area) => <div key={area.id} className="flex items-center gap-3 rounded-lg border border-[#e5ebe7] px-4 py-3"><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{area.name}</div><div className="mt-0.5 text-xs text-[#839087]">{area.code} · {model.equipment.filter((item) => item.areaId === area.id).length} equipment · {DEMO_LABEL}</div></div><Button variant="ghost" size="icon" aria-label={`Edit ${area.name}`} onClick={() => setEditor({ kind: "area", id: area.id })}><Pencil size={15} /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${area.name}`} onClick={() => remove({ action: "area.delete", id: area.id }, area.name)}><Trash2 size={15} /></Button></div>)}</div></CardContent></Card><Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Production lines</CardTitle><CardDescription className="mt-1">Group related production equipment.</CardDescription></div><Button size="sm" onClick={() => setEditor({ kind: "line" })}><Plus size={14} /> Add line</Button></CardHeader><CardContent><div className="space-y-2">{model.productionLines.map((line) => <div key={line.id} className="flex items-center gap-3 rounded-lg border border-[#e5ebe7] px-4 py-3"><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{line.name}</div><div className="mt-0.5 text-xs text-[#839087]">{line.code} · {areaById.get(line.areaId ?? "")?.name ?? "No area"} · {DEMO_LABEL}</div></div><Button variant="ghost" size="icon" aria-label={`Edit ${line.name}`} onClick={() => setEditor({ kind: "line", id: line.id })}><Pencil size={15} /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${line.name}`} onClick={() => remove({ action: "line.delete", id: line.id }, line.name)}><Trash2 size={15} /></Button></div>)}</div></CardContent></Card></div>}

    {tab === "factory" && <Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Factory profile</CardTitle><CardDescription className="mt-1">Core context for this demonstration workspace.</CardDescription></div><Button variant="outline" size="sm" onClick={() => setEditor({ kind: "factory" })}><Pencil size={14} /> Edit profile</Button></CardHeader><CardContent><div className="grid gap-5 sm:grid-cols-2"><div><div className="text-xs text-[#8a968e]">Factory</div><div className="mt-1 text-sm font-semibold">{model.factory.name}</div></div><div><div className="text-xs text-[#8a968e]">Location</div><div className="mt-1 text-sm font-semibold">{model.factory.city}, {model.factory.state}</div></div><div><div className="text-xs text-[#8a968e]">Employees</div><div className="mt-1 text-sm font-semibold">{model.factory.employeeCount ?? "—"}</div></div><div><div className="text-xs text-[#8a968e]">Operating shifts</div><div className="mt-1 text-sm font-semibold">{model.factory.shiftCount ?? "—"}</div></div></div><p className="mt-6 text-xs text-[#829087]">{DEMO_LABEL}</p></CardContent></Card>}

    {editor && <FactoryEditor key={`${editor.kind}-${editor.id ?? "new"}`} editor={editor} model={model} busy={busy} error={error} onClose={() => setEditor(null)} onSave={(command) => void execute(command, "Factory model saved")} />}
  </div>;
}
