import "server-only";
import { getMachineStateDiagnostics } from "@/lib/machine-state/service";
import { getProductionEnergyModel } from "@/lib/production-energy/service";
import type { Evidence } from "@/lib/decision-engine/calculation";
import { getWhatIfBaseline } from "@/lib/what-if/service";

export async function getDecisionEvidence(): Promise<Evidence[]> {
  const [machines, production, whatIf] = await Promise.all([getMachineStateDiagnostics(), getProductionEnergyModel(), getWhatIfBaseline()]);
  const machine = (code: string) => machines.diagnoses.find((item) => item.code === code);
  const asset = (code: string) => production.assets.find((item) => item.equipmentCode === code);
  const lc = machine("LC-01");
  const ac = machine("AC-01");
  const acAssessment = asset("AC-01");
  const pc = asset("PC-01");
  const wl = asset("WL-01");
  return [
    { machine: "LC-01", dailyAvoidableIdleKwh: lc?.avoidableIdleEnergyKwhPerDay, dailyMachineKwh: whatIf.lc.dailyEnergyKwh, confidence: lc?.confidence ?? 0, diagnosticStatus: lc?.status ?? "Unavailable", detail: lc ? `${lc.excessIdleHoursPerDay.toFixed(1)} h/day excess idle; ${lc.betweenJobsSharePercent.toFixed(0)}% between jobs; output change ${lc.outputChangePercent === null ? "unknown" : `${lc.outputChangePercent.toFixed(1)}%`}.` : "No direct state diagnosis." },
    { machine: "AC-01", dailyAvoidableIdleKwh: ac?.avoidableIdleEnergyKwhPerDay, dailyMachineKwh: acAssessment?.actualEnergyKwh ?? 0, confidence: ac?.confidence ?? 0, diagnosticStatus: ac?.status ?? "Unavailable", detail: ac ? `${ac.avoidableIdleHoursPerDay.toFixed(1)} h/day candidate unloaded time. Confirm compressed-air demand before changing controls.` : "No direct state diagnosis." },
    { machine: "PC-01", dailyMachineKwh: pc?.actualEnergyKwh ?? 0, confidence: pc?.confidence ?? 0, diagnosticStatus: pc?.state ?? "Unavailable", detail: pc ? `${pc.deviationPercent?.toFixed(0) ?? "?"}% SEC deviation; ${pc.comparisonLevel.toLowerCase()}. Confirm batch and dispatch requirements.` : "No production-aware assessment." },
    { machine: "WL-01", dailyMachineKwh: wl?.actualEnergyKwh ?? 0, dailySecExcessKwh: Math.max(0, wl?.residualKwh ?? 0), confidence: wl?.confidence ?? 0, diagnosticStatus: wl?.state ?? "Unavailable", detail: wl ? `${wl.deviationPercent?.toFixed(0) ?? "?"}% SEC deviation; ${wl.comparableCount} healthy comparable observations.` : "No production-aware assessment." }
  ];
}
