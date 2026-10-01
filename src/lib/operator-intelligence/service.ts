import "server-only";
import { prisma } from "@/lib/prisma";
import { DEMO_FACTORY_ID } from "@/lib/factory-model/schema";
import { getMachineStateDiagnostics } from "@/lib/machine-state/service";
import { OPERATOR_CATEGORIES, causeGroup, causeLabel, eventDiagnosis, normalizedCause, recommendationForReason } from "@/lib/operator-intelligence/rules";
import { LC01_EXCESS_IDLE_MATERIAL_WAIT as lcScenario } from "@/lib/simulation/lc01-demo-scenario";
import { isLc01ScenarioActive } from "@/lib/simulation/scenario-mode";

const round = (n: number, places = 2) => Number(n.toFixed(places));
const overlapMinutes = (sampleStart: Date, sampleMinutes: number, startAt: Date, endAt: Date) => Math.max(0, Math.min(sampleStart.getTime() + sampleMinutes * 60_000, endAt.getTime()) - Math.max(sampleStart.getTime(), startAt.getTime())) / 60_000;
function istLocal(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export async function getOperatorInsights() {
  const run = await prisma.simulationRun.findFirst({ where: { factoryId: DEMO_FACTORY_ID, active: true }, orderBy: { generatedAt: "desc" } });
  if (!run) throw new Error("Simulation history is not ready. Run npm run sim:generate.");
  const scenarioActive = await isLc01ScenarioActive();
  const windowStart = new Date(run.endAt.getTime() - 7 * 86_400_000);
  const [machineState, equipment, events] = await Promise.all([
    getMachineStateDiagnostics(),
    prisma.equipment.findMany({ where: { factoryId: DEMO_FACTORY_ID, status: "active" }, orderBy: { code: "asc" } }),
    prisma.operatorEvent.findMany({ where: { runId: run.id, startAt: { lt: run.endAt }, endAt: { gt: windowStart } }, orderBy: { startAt: "desc" } })
  ]);
  const machines = equipment.filter((item) => !["grid", "transformer", "main incomer", "distribution panel"].includes(item.equipmentType)).map((item) => ({ id: item.id, code: item.code, name: item.name, meteringMode: item.meteringMode, stateSupported: machineState.eligibleMachines.some((machine) => machine.id === item.id) }));
  const byId = new Map(machines.map((machine) => [machine.id, machine]));
  type Cause = { group: string; candidateKwh: number; candidateMinutes: number; loggedMinutes: number; eventCount: number; recommendation: string; reasonCodes: Set<string> };
  const causes = new Map<string, Cause>();
  const ensureCause = (reason: string) => {
    const group = causeGroup(reason);
    const existing = causes.get(group);
    if (existing) { existing.reasonCodes.add(reason); return existing; }
    const item: Cause = { group, candidateKwh: 0, candidateMinutes: 0, loggedMinutes: 0, eventCount: 0, recommendation: recommendationForReason(reason), reasonCodes: new Set([reason]) };
    causes.set(group, item);
    return item;
  };
  const allocatedBySample = new Map<string, number>();
  let necessaryMinutes = 0, unexplainedMinutes = 0;
  for (const diagnosis of machineState.diagnoses) for (const day of diagnosis.days) {
    if (!day.intervals.length) continue;
    const selected = day.intervals.filter((item) => item.idleClass === "Potentially Avoidable");
    const rawEnergy = selected.reduce((sum, item) => sum + item.powerKw * machineState.assumptions.intervalMinutes / 60, 0);
    for (const interval of day.intervals) {
      if (interval.idleClass === "Necessary") necessaryMinutes += machineState.assumptions.intervalMinutes;
      if (interval.idleClass === "Unexplained") unexplainedMinutes += machineState.assumptions.intervalMinutes;
      if (interval.idleClass !== "Potentially Avoidable" || !interval.reasonCode) continue;
      const allocated = rawEnergy ? day.avoidableIdleEnergyKwh * (interval.powerKw * machineState.assumptions.intervalMinutes / 60) / rawEnergy : 0;
      allocatedBySample.set(`${diagnosis.equipmentId}:${interval.at}`, allocated);
      const cause = ensureCause(interval.reasonCode);
      cause.candidateKwh += allocated;
      cause.candidateMinutes += machineState.assumptions.intervalMinutes;
    }
  }
  for (const event of events) {
    const cause = ensureCause(event.reasonCode);
    cause.loggedMinutes += (event.endAt.getTime() - event.startAt.getTime()) / 60_000;
    cause.eventCount++;
  }
  const eventInsights = events.slice(0, 80).map((event) => {
    const machine = byId.get(event.equipmentId);
    const diagnosis = machineState.diagnoses.find((item) => item.equipmentId === event.equipmentId);
    const interval = diagnosis?.days.flatMap((day) => day.intervals).filter((item) => {
      const at = new Date(item.at);
      return overlapMinutes(at, machineState.assumptions.intervalMinutes, event.startAt, event.endAt) > 0;
    }) ?? [];
    let observedIdle = 0, candidateMinutes = 0, candidateEnergy = 0, unexplainedBefore = 0, schedulingBefore = 0;
    for (const item of interval) {
      if (!item.idleClass) continue;
      const minutes = overlapMinutes(new Date(item.at), machineState.assumptions.intervalMinutes, event.startAt, event.endAt);
      observedIdle += minutes;
      if (item.withoutOperatorContextReason === "INSUFFICIENT_CONTEXT") unexplainedBefore += minutes;
      if (item.withoutOperatorContextReason === "JOB_SCHEDULING_GAP") schedulingBefore += minutes;
      if (item.idleClass === "Potentially Avoidable" && item.reasonCode === event.reasonCode && item.operatorEventSource === event.source) {
        candidateMinutes += minutes;
        candidateEnergy += (allocatedBySample.get(`${event.equipmentId}:${item.at}`) ?? 0) * minutes / machineState.assumptions.intervalMinutes;
      }
    }
    const durationMinutes = (event.endAt.getTime() - event.startAt.getTime()) / 60_000;
    const before = observedIdle <= 0 ? "No energized idle matched before context" : unexplainedBefore >= observedIdle * 0.7 ? `${Math.round(durationMinutes)} minutes unexplained idle` : schedulingBefore >= observedIdle * 0.7 ? `${Math.round(durationMinutes)} minutes attributed to a job scheduling gap` : `${Math.round(observedIdle)} minutes of energized idle without this operator reason`;
    return {
      id: event.id, machineCode: machine?.code ?? "Unknown", machineName: machine?.name ?? "Unknown machine", equipmentId: event.equipmentId,
      startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString(), durationMinutes: round(durationMinutes, 1),
      category: normalizedCause(event.reasonCode), categoryLabel: causeLabel(event.reasonCode), group: causeGroup(event.reasonCode),
      reasonCode: event.reasonCode, note: event.note, source: event.source,
      beforeContext: before, diagnosis: diagnosis ? eventDiagnosis(event.reasonCode, durationMinutes, observedIdle) : "Event logged; no direct machine-level energy diagnosis available",
      observedIdleMinutes: diagnosis ? round(Math.min(durationMinutes, observedIdle), 1) : null,
      candidateAvoidableMinutes: diagnosis ? round(candidateMinutes, 1) : null,
      candidateEnergyKwh: diagnosis ? round(candidateEnergy) : null,
      candidateCostInr: diagnosis ? round(candidateEnergy * machineState.assumptions.tariffInrPerKwh) : null,
      recommendation: observedIdle > 0 ? recommendationForReason(event.reasonCode) : "Check event timing against machine power and job records before assigning energy impact.",
      evidence: diagnosis ? [
        `Operator reason: ${causeLabel(event.reasonCode)}; logged duration ${round(durationMinutes, 1)} minutes.`,
        `${round(observedIdle, 1)} minutes overlap interpreted energized idle at ${machineState.assumptions.intervalMinutes}-minute sampling.`,
        `${round(candidateMinutes, 1)} minutes are counted above the healthy idle allowance; necessary or unexplained time is excluded.`,
        `${machine?.meteringMode.replaceAll("_", " ").toLowerCase() ?? "Unknown"} measurement basis. ${event.source === "DEMO_ENTRY" ? "Entered in the demo workspace." : "Generated for simulation."}`
      ] : ["Operator event is retained as shop-floor context. Direct machine metering is needed for energy attribution."]
    };
  });
  if (scenarioActive) {
    const lc = machines.find((machine) => machine.code === lcScenario.equipmentId);
    if (lc) {
      const cause = ensureCause(lcScenario.operatorReason);
      cause.eventCount++; cause.loggedMinutes += 45; cause.recommendation = lcScenario.recommendedAction;
      const day = new Date(run.endAt.getTime() - 86_400_000);
      const startAt = new Date(day.getTime() + (21 * 60 + 30) * 60_000);
      const endAt = new Date(day.getTime() + (22 * 60 + 15) * 60_000);
      const energy = Number((lcScenario.currentPowerKw * 45 / 60).toFixed(2));
      eventInsights.unshift({
        id: lcScenario.id, machineCode: lc.code, machineName: lc.name, equipmentId: lc.id,
        startAt: startAt.toISOString(), endAt: endAt.toISOString(), durationMinutes: 45,
        category: normalizedCause(lcScenario.operatorReason), categoryLabel: "Waiting for material", group: "Material waiting",
        reasonCode: lcScenario.operatorReason, note: "Next sheet batch not staged near laser",
        source: "SIMULATED", beforeContext: "45 minutes unexplained idle",
        diagnosis: "45-minute material-staging delay while LC-01 drew 9.8 kW",
        observedIdleMinutes: 45, candidateAvoidableMinutes: 45, candidateEnergyKwh: energy,
        candidateCostInr: round(energy * machineState.assumptions.tariffInrPerKwh),
        recommendation: lcScenario.recommendedAction,
        evidence: ["Direct LC-01 meter: 9.8 kW idle after the productive job.", "Simulated operator reason: MATERIAL_WAIT.", "This 45-minute event is part of the 1.5 h/day avoidable-idle scenario, not additional energy."]
      });
    }
  }
  const topCauses = [...causes.values()].map((cause) => ({
    group: cause.group, candidateEnergyKwh: round(cause.candidateKwh), candidateCostInr: round(cause.candidateKwh * machineState.assumptions.tariffInrPerKwh),
    candidateHours: round(cause.candidateMinutes / 60), loggedHours: round(cause.loggedMinutes / 60), eventCount: cause.eventCount,
    recommendation: cause.recommendation, reasonCodes: [...cause.reasonCodes]
  })).sort((a, b) => b.candidateEnergyKwh - a.candidateEnergyKwh || b.loggedHours - a.loggedHours);
  const latestDay = istLocal(new Date(run.endAt.getTime() - 60_000)).slice(0, 10);
  const lcIntervals = machineState.diagnoses.find((item) => item.code === "LC-01")?.days.at(-1)?.intervals ?? [];
  const unloggedIdle = lcIntervals.filter((item) => item.idleClass === "Unexplained" && !item.operatorEventSource);
  let suggestedStart: Date | null = null;
  for (let index = 0; index <= unloggedIdle.length - 7; index++) {
    const group = unloggedIdle.slice(index, index + 7);
    if (group.every((item, offset) => new Date(item.at).getTime() === new Date(group[0].at).getTime() + offset * machineState.assumptions.intervalMinutes * 60_000)) { suggestedStart = new Date(group[0].at); break; }
  }
  if (!suggestedStart) suggestedStart = new Date(lcIntervals.find((item) => item.idleClass === "Unexplained" && !item.operatorEventSource)?.at ?? new Date(`${latestDay}T14:10:00+05:30`).toISOString());
  return {
    source: "SIMULATED" as const,
    disclaimer: "Demo / simulated data. Logged events describe a fictional factory; estimated energy is not verified savings.",
    period: { startAt: windowStart.toISOString(), endAt: run.endAt.toISOString(), days: 7 },
    formDefaults: { day: latestDay, startLocal: istLocal(suggestedStart), endLocal: istLocal(new Date(suggestedStart.getTime() + 32 * 60_000)) },
    categories: OPERATOR_CATEGORIES,
    machines,
    summary: { loggedEvents: events.length, candidateEnergyKwh: round(topCauses.reduce((sum, item) => sum + item.candidateEnergyKwh, 0)), candidateCostInr: round(topCauses.reduce((sum, item) => sum + item.candidateCostInr, 0)), necessaryHours: round(necessaryMinutes / 60), unexplainedHours: round(unexplainedMinutes / 60) },
    topCauses, eventInsights
  };
}
