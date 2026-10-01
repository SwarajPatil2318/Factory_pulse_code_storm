import type { EnergyMetric, EnergyNode, VisualStatus } from "@/lib/energy-map/types";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export const formatInr = (value: number) => `₹${inr.format(value)}`;
export const formatNumber = (value: number) => number.format(value);
export const compact = (value: number) => value >= 10_000 ? `${(value / 1000).toFixed(1)}k` : number.format(value);

export function metricValue(node: EnergyNode, metric: EnergyMetric) {
  if (metric === "cost") return { value: formatInr(node.costTodayInr), label: "Cost today" };
  if (metric === "power") return { value: `${formatNumber(node.currentKw)} kW`, label: "Current power" };
  if (metric === "energy") return { value: `${formatNumber(node.todayKwh)} kWh`, label: "Energy today" };
  return { value: `${node.secKwhPerPart.toFixed(2)} kWh/part`, label: "SEC contribution" };
}

export const statusStyle: Record<VisualStatus, { border: string; dot: string; soft: string; text: string; label: string }> = {
  normal: { border: "#b9dac7", dot: "#3c8c5a", soft: "#eaf4ed", text: "#27664d", label: "Normal" },
  watch: { border: "#e7ce9b", dot: "#b47a25", soft: "#fff4df", text: "#9b681b", label: "Watch" },
  critical: { border: "#e7b9b5", dot: "#bd514b", soft: "#fcedea", text: "#a83d39", label: "Confirmed issue" },
  offline: { border: "#d8dfda", dot: "#9ba6a0", soft: "#f2f4f3", text: "#67746c", label: "Offline" },
  inferred: { border: "#cbd9df", dot: "#6f8997", soft: "#edf2f4", text: "#5d7482", label: "Inferred" }
};
