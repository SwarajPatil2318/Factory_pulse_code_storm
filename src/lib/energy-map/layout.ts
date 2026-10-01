import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { EnergyMapSnapshot, EnergyMetric, EnergyNode } from "@/lib/energy-map/types";

export type MapFlowNode = Node<{ energy: EnergyNode; metric: EnergyMetric; selected: boolean }, "energy">;
export type MapFlowEdge = Edge;

const STEP_X = 246;
const STEP_Y = 192;
const NODE_WIDTH = 220;

/** Compact layered layout: supply trunk, feeder lanes, then downstream assets. */
export function buildEnergyFlow(snapshot: EnergyMapSnapshot, visibleIds: Set<string>, metric: EnergyMetric, selectedId: string | null) {
  const shown = snapshot.nodes.filter((item) => visibleIds.has(item.id));
  const byId = new Map(shown.map((item) => [item.id, item]));
  const childMap = new Map(shown.map((item) => [item.id, [] as string[]]));
  const edges = snapshot.connections.filter((edge) => visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId));
  for (const edge of edges) childMap.get(edge.sourceId)?.push(edge.targetId);
  for (const children of childMap.values()) children.sort((a, b) => (byId.get(a)?.code ?? "").localeCompare(byId.get(b)?.code ?? ""));
  const roots = shown.filter((item) => !edges.some((edge) => edge.targetId === item.id));
  const mainRoot = roots.find((item) => item.code === "GRID") ?? roots.find((item) => item.equipmentType === "grid") ?? roots[0];
  const positions = new Map<string, { x: number; y: number }>();
  if (!mainRoot) return { nodes: [] as MapFlowNode[], edges: [] as MapFlowEdge[] };

  const trunk: string[] = [mainRoot.id];
  const trunkSeen = new Set(trunk);
  while (true) {
    const next = childMap.get(trunk[trunk.length - 1]) ?? [];
    if (next.length !== 1 || trunkSeen.has(next[0])) break;
    trunk.push(next[0]); trunkSeen.add(next[0]);
  }
  const feederIds = childMap.get(trunk[trunk.length - 1]) ?? [];
  const lanes = feederIds.map((id) => {
    const descendants: string[] = [];
    const queue = [...(childMap.get(id) ?? [])];
    const seen = new Set<string>([id]);
    while (queue.length) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next); descendants.push(next); queue.push(...(childMap.get(next) ?? []));
    }
    return { id, descendants, columns: Math.min(3, Math.max(1, descendants.length)) };
  });
  const laneWidth = lanes.reduce((sum, lane) => sum + lane.columns * STEP_X + 28, 0);
  const totalWidth = Math.max(laneWidth, trunk.length * STEP_X, 850);
  const trunkStart = Math.max(0, (totalWidth - trunk.length * STEP_X) / 2);
  trunk.forEach((id, index) => positions.set(id, { x: trunkStart + index * STEP_X, y: 10 }));
  let offset = Math.max(0, (totalWidth - laneWidth) / 2);
  let deepestRow = 0;
  for (const lane of lanes) {
    const width = lane.columns * STEP_X + 28;
    positions.set(lane.id, { x: offset + (width - NODE_WIDTH) / 2, y: 220 });
    lane.descendants.forEach((id, index) => {
      const row = Math.floor(index / lane.columns);
      deepestRow = Math.max(deepestRow, row);
      positions.set(id, { x: offset + 14 + (index % lane.columns) * STEP_X, y: 430 + row * STEP_Y });
    });
    offset += width;
  }
  const orphaned = shown.filter((item) => !positions.has(item.id));
  const orphanY = feederIds.length ? 430 + (deepestRow + 1) * STEP_Y + 50 : 220;
  orphaned.forEach((item, index) => positions.set(item.id, { x: (index % 4) * STEP_X, y: orphanY + Math.floor(index / 4) * STEP_Y }));

  const maxFlow = Math.max(1, ...edges.map((edge) => edge.flowKwh));
  const flowNodes: MapFlowNode[] = shown.map((energy) => ({
    id: energy.id, type: "energy", position: positions.get(energy.id) ?? { x: 0, y: 0 },
    data: { energy, metric, selected: selectedId === energy.id }, draggable: false, selectable: true
  }));
  const flowEdges: MapFlowEdge[] = edges.map((edge) => {
    const source = positions.get(edge.sourceId)!;
    const target = positions.get(edge.targetId)!;
    const horizontal = Math.abs(source.y - target.y) < 60;
    const width = 1.5 + 4.2 * Math.sqrt(edge.flowKwh / maxFlow);
    return {
      id: edge.id, source: edge.sourceId, target: edge.targetId,
      sourceHandle: horizontal ? "right" : "bottom", targetHandle: horizontal ? "left" : "top",
      type: "smoothstep", selectable: false,
      style: { stroke: "#9eb8a9", strokeWidth: width, opacity: 0.8 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#9eb8a9", width: 12, height: 12 }
    };
  });
  return { nodes: flowNodes, edges: flowEdges };
}

export function filterEnergyNodes(snapshot: EnergyMapSnapshot, areaId: string, status: string) {
  if (!areaId && !status) return new Set(snapshot.nodes.map((item) => item.id));
  const byId = new Map(snapshot.nodes.map((item) => [item.id, item]));
  const visible = new Set<string>();
  for (const item of snapshot.nodes) {
    if (areaId && item.areaId !== areaId) continue;
    if (status && item.visualStatus !== status) continue;
    let cursor: EnergyNode | undefined = item;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id); visible.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
  }
  return visible;
}
