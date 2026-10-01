"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, ChevronDown, ClipboardPlus, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_LABEL } from "@/lib/demo";

type Insight = {
  id: string; machineCode: string; machineName: string; equipmentId: string;
  startAt: string; endAt: string; durationMinutes: number; category: string; categoryLabel: string; group: string;
  reasonCode: string; note: string | null; source: string; beforeContext: string; diagnosis: string;
  observedIdleMinutes: number | null; candidateAvoidableMinutes: number | null; candidateEnergyKwh: number | null; candidateCostInr: number | null;
  recommendation: string; evidence: string[];
};
type InsightsResponse = {
  source: "SIMULATED"; disclaimer: string;
  period: { startAt: string; endAt: string; days: number };
  formDefaults: { day: string; startLocal: string; endLocal: string };
  categories: Array<{ code: string; label: string; group: string }>;
  machines: Array<{ id: string; code: string; name: string; meteringMode: string; stateSupported: boolean }>;
  summary: { loggedEvents: number; candidateEnergyKwh: number; candidateCostInr: number; necessaryHours: number; unexplainedHours: number };
  topCauses: Array<{ group: string; candidateEnergyKwh: number; candidateCostInr: number; candidateHours: number; loggedHours: number; eventCount: number; recommendation: string; reasonCodes: string[] }>;
  eventInsights: Insight[];
};
type Form = { equipmentId: string; startLocal: string; endLocal: string; reasonCode: string; note: string };
const inr = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const num = (value: number, digits = 1) => value.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const dateTime = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const asIstIso = (local: string) => new Date(`${local}${local.length === 16 ? ":00" : ""}+05:30`).toISOString();

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <Card><CardContent className="pt-4"><div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#809087]">{label}</div><div className="mt-2 text-[21px] font-semibold tracking-[-0.025em] text-[#273b2d]">{value}</div><div className="mt-1 text-[11px] text-[#839087]">{note}</div></CardContent></Card>;
}

export function OperatorInsights() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const load = async () => {
    const response = await fetch("/api/operator-insights", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Operator insights unavailable");
    const next = body as InsightsResponse;
    setData(next); setError(null);
    setForm((current) => current ?? { equipmentId: next.machines.find((item) => item.code === "LC-01")?.id ?? next.machines[0]?.id ?? "", startLocal: next.formDefaults.startLocal, endLocal: next.formDefaults.endLocal, reasonCode: "MATERIAL_UNAVAILABLE", note: "" });
    return next;
  };
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Operator insights unavailable")); }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    setFormError(null);
    let startAt: string, endAt: string;
    try { startAt = asIstIso(form.startLocal); endAt = asIstIso(form.endLocal); } catch { setFormError("Enter valid start and end times in IST."); return; }
    if (endAt <= startAt) { setFormError("End time must be after start time."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/operator-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ equipmentId: form.equipmentId, startAt, endAt, reasonCode: form.reasonCode, note: form.note }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save event.");
      const refreshed = await load();
      setSelectedId(body.event.id);
      setForm((current) => current ? { ...current, note: "" } : current);
      if (refreshed.eventInsights.some((item) => item.id === body.event.id)) window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Could not save event."); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    setFormError(null);
    try {
      const response = await fetch(`/api/operator-events?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not remove event.");
      if (selectedId === id) setSelectedId(null);
      await load();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Could not remove event."); }
  };
  if (!data || !form) return error ? <Card><CardContent className="flex items-center gap-3 py-8 text-sm text-[#986c28]">{error}<Button variant="outline" size="sm" onClick={() => void load().catch((cause) => setError(String(cause)))}><RefreshCw size={13} />Retry</Button></CardContent></Card> : <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-80" /><Skeleton className="h-72" /></div>;
  const selected = data.eventInsights.find((item) => item.id === selectedId) ?? null;
  const visibleEvents = showAll ? data.eventInsights : data.eventInsights.slice(0, 12);
  const maxCause = Math.max(1, ...data.topCauses.map((item) => item.candidateEnergyKwh));
  const selectedMachine = data.machines.find((item) => item.id === form.equipmentId);
  return <div className="space-y-5">
    <div className="rounded-lg border border-[#dce7df] bg-[#f7faf8] px-4 py-3 text-xs leading-5 text-[#607466]">{DEMO_LABEL}. Operator events add shop-floor context to the simulated machine timeline. An event changes the diagnosis only where its time overlaps interpreted machine operation.</div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Operator events" value={String(data.summary.loggedEvents)} note="Recent 7 simulated days" /><Stat label="Candidate energy" value={`${num(data.summary.candidateEnergyKwh)} kWh`} note="Above healthy idle allowance" /><Stat label="Potential cost" value={inr(data.summary.candidateCostInr)} note="Assumed tariff · not verified savings" /><Stat label="Unexplained idle" value={`${num(data.summary.unexplainedHours)} h`} note="Time still needing context" /></div>
    <div className="grid gap-5 xl:grid-cols-[.82fr_1.18fr]"><Card><CardHeader><div className="flex items-center gap-2"><ClipboardPlus size={17} className="text-[#397454]" /><CardTitle>Log an event</CardTitle></div><CardDescription>Four quick fields and an optional note · times in IST · {DEMO_LABEL}</CardDescription></CardHeader><CardContent><form onSubmit={(event) => void submit(event)} className="space-y-4"><label className="block text-xs font-semibold text-[#4d6655]">Machine<select required value={form.equipmentId} onChange={(event) => setForm({ ...form, equipmentId: event.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-[#dbe5dd] bg-white px-3 text-sm font-normal text-[#34483a] outline-none focus:border-[#6b9b7b]">{data.machines.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-[#4d6655]">Start time <span className="font-normal text-[#829188]">IST</span><input required type="datetime-local" step="60" value={form.startLocal} onChange={(event) => setForm({ ...form, startLocal: event.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-[#dbe5dd] bg-white px-3 text-sm font-normal text-[#34483a] outline-none focus:border-[#6b9b7b]" /></label><label className="block text-xs font-semibold text-[#4d6655]">End time <span className="font-normal text-[#829188]">IST</span><input required type="datetime-local" step="60" value={form.endLocal} onChange={(event) => setForm({ ...form, endLocal: event.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-[#dbe5dd] bg-white px-3 text-sm font-normal text-[#34483a] outline-none focus:border-[#6b9b7b]" /></label></div><label className="block text-xs font-semibold text-[#4d6655]">Event category<select required value={form.reasonCode} onChange={(event) => setForm({ ...form, reasonCode: event.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-[#dbe5dd] bg-white px-3 text-sm font-normal text-[#34483a] outline-none focus:border-[#6b9b7b]">{data.categories.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label className="block text-xs font-semibold text-[#4d6655]">Note <span className="font-normal text-[#829188]">optional</span><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={500} rows={3} placeholder="What happened on the shop floor?" className="mt-1.5 w-full resize-y rounded-lg border border-[#dbe5dd] bg-white px-3 py-2.5 text-sm font-normal text-[#34483a] outline-none focus:border-[#6b9b7b]" /></label>{selectedMachine && !selectedMachine.stateSupported && <p className="rounded-md border border-[#e5eae6] bg-[#f8faf8] px-3 py-2 text-[11px] text-[#75877a]">This machine has no direct state diagnosis. The event is saved, while energy attribution is withheld.</p>}{formError && <p role="alert" className="text-xs text-[#a14a43]">{formError}</p>}<Button type="submit" disabled={saving || !form.equipmentId} className="h-11 w-full text-sm"><Check size={16} />{saving ? "Saving event…" : "Save operator event"}</Button><p className="text-[11px] leading-4 text-[#87958a]">The form uses the generated 30-day demo history. Select a period with machine idle to see energy attribution.</p></form></CardContent></Card>
      <div className="space-y-5">{selected && <Card><CardHeader><CardTitle>Context changed the diagnosis</CardTitle><CardDescription>{selected.machineCode} · {dateTime(selected.startAt)}–{dateTime(selected.endAt)} · {DEMO_LABEL}</CardDescription></CardHeader><CardContent><div ref={resultRef} className="space-y-3"><div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg border border-[#e3e9e6] bg-[#f8faf9] p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#839187]">Without operator reason</div><p className="mt-1 text-sm font-semibold text-[#61766a]">{selected.beforeContext}</p></div><div className="rounded-lg border border-[#dce8df] bg-[#f1f8f3] p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5d8a6b]">With operator reason</div><p className="mt-1 text-sm font-semibold text-[#2e6245]">{selected.diagnosis}</p></div></div><div className="rounded-lg border border-[#e5eae5] px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#839187]">Recommended action</div><p className="mt-1 text-sm font-semibold text-[#314b39]">{selected.recommendation}</p><p className="mt-2 text-[11px] text-[#7a8a7d]">{num(selected.observedIdleMinutes ?? 0)} min energized idle matched · {num(selected.candidateEnergyKwh ?? 0)} kWh counted as candidate energy · {inr(selected.candidateCostInr ?? 0)} potential impact</p></div></div></CardContent></Card>}
        <Card><CardHeader><CardTitle>Top operational causes</CardTitle><CardDescription>Ranked by candidate avoidable energy in the last 7 simulated days · necessary time remains visible</CardDescription></CardHeader><CardContent className="space-y-3">{data.topCauses.slice(0, 7).map((item) => <div key={item.group} className="rounded-lg border border-[#e6ece7] px-3 py-2.5"><div className="flex items-center justify-between gap-3 text-xs"><strong className="text-[#3d5844]">{item.group}</strong><span className="whitespace-nowrap font-semibold text-[#344e3c]">{num(item.candidateEnergyKwh)} kWh</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf1ee]"><div className="h-full rounded-full bg-[#86aa90]" style={{ width: `${Math.max(item.candidateEnergyKwh > 0 ? 2 : 0, item.candidateEnergyKwh / maxCause * 100)}%` }} /></div><div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[10px] text-[#859288]"><span>{num(item.candidateHours)} h counted · {item.eventCount} logs</span><span>{inr(item.candidateCostInr)} potential</span></div></div>)}<p className="text-[11px] leading-4 text-[#86948a]">Setup, inspection and maintenance logs may show 0 candidate kWh when the time is necessary. No event is treated as waste merely because it was logged.</p></CardContent></Card></div></div>
    <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Recent shop-floor context</CardTitle><CardDescription>Time-aligned diagnosis and action for each logged event · {DEMO_LABEL}</CardDescription></div><Button variant="outline" size="sm" onClick={() => void load().catch((cause) => setError(String(cause)))}><RefreshCw size={13} />Refresh</Button></div></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2">{visibleEvents.map((item) => <article key={item.id} className={`rounded-lg border p-3.5 ${item.id === selectedId ? "border-[#96bd9e] bg-[#f8fbf8]" : "border-[#e4ebe5] bg-white"}`}><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold text-[#304b39]">{item.machineCode} · {item.categoryLabel}</div><div className="mt-1 text-[11px] text-[#859289]">{dateTime(item.startAt)}–{dateTime(item.endAt)} IST · {num(item.durationMinutes, 0)} min</div></div>{item.source === "DEMO_ENTRY" ? <button onClick={() => void remove(item.id)} aria-label={`Remove ${item.machineCode} event`} className="rounded p-1.5 text-[#8c9b90] hover:bg-[#fff1ee] hover:text-[#a4534b]"><Trash2 size={14} /></button> : <span className="rounded bg-[#f1f4f2] px-1.5 py-1 text-[9px] font-semibold text-[#839187]">SIMULATED</span>}</div><p className="mt-3 text-xs font-semibold leading-5 text-[#425e49]">{item.diagnosis}</p>{item.note && <p className="mt-1 text-[11px] leading-4 text-[#738578]">“{item.note}”</p>}<div className="mt-3 border-t border-[#edf1ee] pt-2.5 text-[11px] leading-4 text-[#61766a]"><span className="font-semibold text-[#407754]">Action:</span> {item.recommendation}</div><details className="mt-2 text-[11px] text-[#7a8b7d]"><summary className="flex cursor-pointer items-center gap-1 font-medium text-[#51735b]">Evidence <ChevronDown size={12} /></summary><ul className="mt-2 space-y-1">{item.evidence.map((line, index) => <li key={index} className="flex gap-1.5"><ArrowRight size={11} className="mt-0.5 shrink-0" />{line}</li>)}</ul></details></article>)}</div>{data.eventInsights.length > 12 && <button onClick={() => setShowAll((value) => !value)} className="mt-4 text-xs font-semibold text-[#387451]">{showAll ? "Show fewer events" : `Show all ${data.eventInsights.length} recent events`}</button>}{!data.eventInsights.length && <p className="py-6 text-center text-xs text-[#87958a]">No operator events in this period.</p>}</CardContent></Card>
  </div>;
}
