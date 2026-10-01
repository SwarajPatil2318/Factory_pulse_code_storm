"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { compact, formatNumber, metricValue, statusStyle } from "@/lib/energy-map/format";
import type { MapFlowNode } from "@/lib/energy-map/layout";

const handleStyle = { width: 2, height: 2, opacity: 0, border: 0, background: "transparent" };

export function EnergyNodeCard({ data }: NodeProps<MapFlowNode>) {
  const item = data.energy;
  const status = statusStyle[item.visualStatus];
  const primary = metricValue(item, data.metric);
  return <div className={`w-[220px] rounded-[10px] border bg-white px-3 py-2.5 shadow-[0_2px_8px_rgba(23,42,31,.07)] transition-shadow hover:shadow-[0_5px_14px_rgba(23,42,31,.12)] ${data.selected ? "ring-2 ring-[#27664d]/35" : ""}`} style={{ borderColor: status.border }}>
    <Handle type="target" id="left" position={Position.Left} style={handleStyle} />
    <Handle type="target" id="top" position={Position.Top} style={handleStyle} />
    <Handle type="source" id="right" position={Position.Right} style={handleStyle} />
    <Handle type="source" id="bottom" position={Position.Bottom} style={handleStyle} />
    <div className="flex items-center justify-between gap-2"><div className="truncate text-[12px] font-bold tracking-[0.035em] text-[#263a2d]">{item.code}</div><span className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[9px] font-semibold" style={{ color: status.text, background: status.soft }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: status.dot }} />{status.label}</span></div>
    <div className="mt-0.5 truncate text-[10px] text-[#78877c]" title={item.name}>{item.name}</div>
    <div className="mt-2 flex items-end justify-between border-t border-[#edf1ee] pt-2"><div><div className="text-[18px] font-semibold leading-none tracking-[-0.035em] text-[#26372d]">{primary.value}</div><div className="mt-1 text-[9px] font-medium text-[#87948a]">{primary.label}</div></div><div className="text-right text-[10px] font-semibold text-[#65796b]">{formatNumber(item.percentPlant)}%<div className="text-[9px] font-normal text-[#8a968d]">of plant</div></div></div>
    <div className="mt-2 truncate text-[10px] text-[#607067]">{formatNumber(item.currentKw)} kW <span className="mx-0.5 text-[#b0bcb2]">·</span> {compact(item.todayKwh)} kWh <span className="mx-0.5 text-[#b0bcb2]">·</span> ₹{compact(item.costTodayInr)}</div>
    <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#edf1ee] pt-2 text-[9px]"><span className="capitalize font-semibold text-[#4b5f52]">{item.operatingState}</span><span className="truncate text-[#73857a]">{item.measurementConfidence}% confidence</span></div>
    <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-[#7f8e82]"><span className="truncate">{item.measurementBasis}</span>{item.childIds.length > 0 && item.unallocatedKwh > 0 && <span className="shrink-0 font-semibold text-[#9a6b2a]">+{formatNumber(item.unallocatedPercent)}% unattributed</span>}</div>
  </div>;
}
