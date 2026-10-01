"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import type { EnergyMapSnapshot } from "@/lib/energy-map/types";

type PreviewStatus = "normal" | "opportunity" | "watch";
type PreviewNode = Node<{ code: string; name: string; kw: number; status: PreviewStatus; selected: boolean }, "preview">;
const positions: Record<string, { x: number; y: number }> = {
  GRID: { x: 0, y: 120 }, "TR-01": { x: 145, y: 120 }, "M-01": { x: 290, y: 120 }, "MDB-01": { x: 435, y: 120 },
  "PF-01": { x: 580, y: 38 }, "UF-01": { x: 580, y: 205 },
  "LC-01": { x: 750, y: 2 }, "PC-01": { x: 750, y: 91 }, "AC-01": { x: 750, y: 205 }
};
const visual = {
  normal: { border: "#dce6df", dot: "#8da49a", soft: "#f6f9f7", text: "#667e70", label: "Normal" },
  opportunity: { border: "#a9cfb3", dot: "#388759", soft: "#e9f4ec", text: "#28724a", label: "Opportunity" },
  watch: { border: "#ead6ad", dot: "#bf852d", soft: "#fff7e8", text: "#9a6d2b", label: "Watch" }
};
const nodeTypes = { preview: PreviewCard };

function statusFor(code: string, demoStep: number | null): PreviewStatus {
  if (demoStep === 0) return "normal";
  if (code === "LC-01") return demoStep === 1 ? "watch" : "opportunity";
  if (code === "AC-01" || code === "PC-01") return demoStep === 1 ? "normal" : "watch";
  return "normal";
}

function PreviewCard({ data }: NodeProps<PreviewNode>) {
  const style = visual[data.status];
  return <div className={`w-[126px] rounded-lg border bg-white px-2.5 py-2 shadow-[0_1px_3px_rgba(28,48,34,.05)] ${data.selected ? "ring-2 ring-[#38865a]/35" : ""}`} style={{ borderColor: style.border }}>
    <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 2, height: 2 }} /><Handle type="source" position={Position.Right} style={{ opacity: 0, width: 2, height: 2 }} />
    <div className="flex items-center justify-between gap-1"><strong className="truncate text-[11px] text-[#304a38]">{data.code}</strong><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: style.dot }} /></div>
    <div className="mt-0.5 truncate text-[9px] text-[#8a998e]" title={data.name}>{data.name}</div>
    <div className="mt-2 flex items-center justify-between gap-1 border-t border-[#edf1ee] pt-1.5"><span className="text-[10px] font-semibold text-[#536e5a]">{data.kw.toFixed(1)} kW</span><span className="rounded px-1 py-0.5 text-[8px] font-semibold" style={{ color: style.text, backgroundColor: style.soft }}>{style.label}</span></div>
  </div>;
}

export function EnergyMapPreview({ snapshot, selectedId, onSelect, demoStep }: { snapshot: EnergyMapSnapshot; selectedId: string | null; onSelect: (id: string) => void; demoStep: number | null }) {
  const { nodes, edges } = useMemo(() => {
    const selected = snapshot.nodes.filter((node) => positions[node.code]);
    const visible = new Set(selected.map((node) => node.id));
    const flowNodes: PreviewNode[] = selected.map((node) => ({ id: node.id, type: "preview", position: positions[node.code], data: { code: node.code, name: node.name, kw: node.currentKw, status: statusFor(node.code, demoStep), selected: selectedId === node.id }, draggable: false }));
    const flowEdges: Edge[] = snapshot.connections.filter((edge) => visible.has(edge.sourceId) && visible.has(edge.targetId)).map((edge) => ({ id: edge.id, source: edge.sourceId, target: edge.targetId, type: "smoothstep", selectable: false, style: { stroke: "#aec4b3", strokeWidth: 2 } }));
    return { nodes: flowNodes, edges: flowEdges };
  }, [snapshot, selectedId, demoStep]);
  const selected = snapshot.nodes.find((node) => node.id === selectedId);
  return <div><div className="overflow-x-auto rounded-lg border border-[#e3eae5] bg-[#fafcfb]"><div className="h-[300px] min-w-[920px]"><ReactFlow<PreviewNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_, node) => onSelect(node.id)} fitView fitViewOptions={{ padding: .05, maxZoom: 1 }} minZoom={.55} maxZoom={1.2} nodesDraggable={false} nodesConnectable={false} zoomOnScroll={false} panOnDrag proOptions={{ hideAttribution: true }}><Background gap={24} size={1} color="#e8eee9" /></ReactFlow></div></div>
    {selected ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e2eae3] bg-[#f9fbf9] px-3 py-2.5"><div><span className="text-xs font-semibold text-[#3b6146]">{selected.code} · {selected.name}</span><span className="ml-2 text-[11px] text-[#809086]">{selected.currentKw.toFixed(1)} kW · {selected.todayKwh.toFixed(0)} kWh today · {selected.measurementBasis}</span></div><Link href="/live-energy-map" className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#35794f] hover:underline">Open full map <ArrowUpRight size={12} /></Link></div> : <p className="mt-2 text-[11px] text-[#87958a]">Select a node to inspect its simulated power and measurement basis. Scroll horizontally on smaller screens.</p>}
  </div>;
}
