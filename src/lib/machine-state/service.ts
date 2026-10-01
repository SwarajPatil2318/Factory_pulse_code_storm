import "server-only";
import { prisma } from "@/lib/prisma";
import { DEMO_FACTORY_ID } from "@/lib/factory-model/schema";
import { assumptions } from "@/lib/simulation/generator";
import { diagnoseMachine, type MachineProfile } from "@/lib/machine-state/engine";
import { LC01_EXCESS_IDLE_MATERIAL_WAIT as lcScenario } from "@/lib/simulation/lc01-demo-scenario";
import { isLc01ScenarioActive } from "@/lib/simulation/scenario-mode";

const power = assumptions.powerKw as unknown as Record<string, Record<string, [number, number]>>;
const isMachine = (type: string) => !["grid", "transformer", "main incomer", "distribution panel"].includes(type);

export async function getMachineStateDiagnostics(options?: { scenario?: boolean }) {
  const scenarioActive = options?.scenario ?? await isLc01ScenarioActive();
  const run = await prisma.simulationRun.findFirst({ where: { factoryId: DEMO_FACTORY_ID, active: true }, orderBy: { generatedAt: "desc" } });
  if (!run) throw new Error("Simulation history is not ready. Run npm run sim:generate.");
  const equipment = await prisma.equipment.findMany({ where: { factoryId: DEMO_FACTORY_ID }, orderBy: { code: "asc" } });
  const eligible = equipment.filter((item) => item.meteringMode === "DIRECT_METER" && isMachine(item.equipmentType) && item.status === "active" && power[item.code]);
  const ids = eligible.map((item) => item.id);
  const assembly = equipment.find((item) => item.code === "AS-01");
  const [readings, jobs, plantJobs, outputJobs, events, signals] = await Promise.all([
    prisma.energyReading.findMany({ where: { runId: run.id, equipmentId: { in: ids } }, select: { equipmentId: true, timestamp: true, powerKw: true, state: true }, orderBy: { timestamp: "asc" } }),
    prisma.productionJob.findMany({ where: { runId: run.id, equipmentId: { in: ids } }, select: { id: true, equipmentId: true, actualStart: true, actualEnd: true, goodUnits: true, shift: true } }),
    prisma.productionJob.findMany({ where: { runId: run.id }, select: { id: true, actualStart: true, actualEnd: true, goodUnits: true, shift: true } }),
    assembly ? prisma.productionJob.findMany({ where: { runId: run.id, equipmentId: assembly.id }, select: { id: true, actualStart: true, actualEnd: true, goodUnits: true, shift: true } }) : Promise.resolve([]),
    prisma.operatorEvent.findMany({ where: { runId: run.id, equipmentId: { in: ids } }, orderBy: { startAt: "asc" } }),
    prisma.machineStateSignal.findMany({ where: { runId: run.id, equipmentId: { in: ids } }, orderBy: { startAt: "asc" } })
  ]);
  const diagnoses = eligible.map((item) => {
    const ranges = power[item.code];
    const productive = ranges.PRODUCTIVE ?? ranges.LOADED;
    const idle = ranges.IDLE ?? ranges.UNLOADED;
    if (!productive || !idle) return null;
    const profile: MachineProfile = {
      code: item.code, productiveKw: productive, idleKw: idle, setupKw: ranges.SETUP ?? (item.code === "AC-01" ? [14, 22] : undefined),
      offBelowKw: 1, intervalMinutes: run.intervalMinutes,
      shiftWindows: assumptions.shifts.map((shift) => ({ startMinute: shift.startMinute, endMinute: shift.endMinute })),
      tariffInrPerKwh: assumptions.tariffInrPerKwh,
      productionDaysPerMonth: assumptions.productionDaysPerMonth,
      meteringBasis: item.meteringMode, productiveWithoutJob: item.code === "AC-01"
    };
    const diagnosis = diagnoseMachine({
      profile,
      readings: readings.filter((row) => row.equipmentId === item.id).map((row) => ({ timestamp: row.timestamp, powerKw: row.powerKw, simulatedState: row.state })),
      jobs: jobs.filter((job) => job.equipmentId === item.id), plantJobs: item.code === "AC-01" ? plantJobs : [], outputJobs: item.code === "AC-01" ? outputJobs : [],
      events: events.filter((event) => event.equipmentId === item.id), signals: signals.filter((signal) => signal.equipmentId === item.id),
      baselineDays: run.baselineDays, recentDays: 7
    });
    const projected = scenarioActive && item.code === lcScenario.equipmentId
      ? projectLc01Diagnosis(diagnosis, run.intervalMinutes)
      : diagnosis;
    return { ...projected, equipmentName: item.name, equipmentId: item.id, meteringBasis: item.meteringMode,
      days: projected.days.map((day, index) => ({ ...day, intervals: index >= projected.days.length - 7 ? day.intervals : [] })) };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
  return {
    source: "SIMULATED" as const,
    disclaimer: "Demo / simulated data. Potentially avoidable idle energy is an engineering estimate, not verified savings.",
    assumptions: { baselineDays: run.baselineDays, recentDays: 7, tariffInrPerKwh: assumptions.tariffInrPerKwh, productionDaysPerMonth: assumptions.productionDaysPerMonth, intervalMinutes: run.intervalMinutes },
    eligibleMachines: eligible.map((item) => ({ id: item.id, code: item.code, name: item.name })),
    excludedMachines: equipment.filter((item) => isMachine(item.equipmentType) && item.status === "active" && !ids.includes(item.id)).map((item) => ({ code: item.code, reason: item.meteringMode !== "DIRECT_METER" ? "No direct meter; state interpretation is withheld." : "No configured power profile." })),
    diagnoses
  };
}

function projectLc01Diagnosis<T extends ReturnType<typeof diagnoseMachine>>(diagnosis: T, intervalMinutes: number): T {
  const idlePower = lcScenario.currentPowerKw;
  const idleHours = lcScenario.observedIdleHoursPerDay;
  const baselineHours = lcScenario.healthyIdleHoursPerDay;
  const avoidableHours = lcScenario.avoidableIdleHoursPerDay;
  const avoidableKwh = Number((idlePower * avoidableHours).toFixed(2));
  const tariff = assumptions.tariffInrPerKwh;
  const monthlyKwh = Number((avoidableKwh * assumptions.productionDaysPerMonth).toFixed(2));
  const recentDays = diagnosis.days.slice(-7).map((day) => {
    const baseDay = new Date(`${day.day}T00:00:00+05:30`);
    const sample = (minute: number, powerKw: number, state: "PRODUCTIVE" | "IDLE", idleClass: "Necessary" | "Potentially Avoidable" | null, reasonCode: string | null) => ({
      at: new Date(baseDay.getTime() + minute * 60_000).toISOString(),
      powerKw, state, idleClass, reasonCode,
      evidence: [`Fixed ${lcScenario.id} presentation scenario; demo / simulated data.`, reasonCode === lcScenario.operatorReason ? "Operator context identifies material waiting between jobs." : "Power state interpreted against the simulated job schedule."],
      activeJobId: state === "PRODUCTIVE" ? "LC01-DEMO-JOB" : null,
      signalSource: null,
      operatorEventSource: reasonCode === lcScenario.operatorReason ? "SIMULATED" : null,
      recommendation: idleClass === "Potentially Avoidable" ? lcScenario.recommendedAction : null,
      withoutOperatorContextReason: idleClass === "Potentially Avoidable" ? "INSUFFICIENT_CONTEXT" : null
    });
    const stamp = (hour: number, minute: number) => hour * 60 + minute;
    const necessary = Array.from({ length: Math.round(baselineHours * 60 / intervalMinutes) }, (_, i) => sample(stamp(12, 0) + i * intervalMinutes, idlePower, "IDLE", "Necessary", "LOADING_UNLOADING"));
    const earlyWait = Array.from({ length: 9 }, (_, i) => sample(stamp(17, 0) + i * intervalMinutes, idlePower, "IDLE", "Potentially Avoidable", lcScenario.operatorReason));
    const lateWait = Array.from({ length: 9 }, (_, i) => sample(stamp(21, 30) + i * intervalMinutes, lcScenario.trend.find((point) => point.time === `${String(Math.floor((21 * 60 + 30 + i * intervalMinutes) / 60)).padStart(2, "0")}:${String((30 + i * intervalMinutes) % 60).padStart(2, "0")}`)?.kw ?? idlePower, "IDLE", "Potentially Avoidable", lcScenario.operatorReason));
    const productive = lcScenario.trend.filter((point) => point.state === "PRODUCTIVE").map((point) => {
      const [hour, minute] = point.time.split(":").map(Number);
      return sample(stamp(hour, minute), point.kw, "PRODUCTIVE", null, null);
    });
    const replaceAt = new Set([...necessary, ...earlyWait, ...lateWait, ...productive].map((row) => row.at));
    const intervals = [...day.intervals.filter((row) => row.state !== "IDLE" && row.state !== "STANDBY" && !replaceAt.has(row.at)), ...necessary, ...earlyWait, ...lateWait, ...productive]
      .sort((a, b) => a.at.localeCompare(b.at));
    const stateMinutes = { ...day.stateMinutes, IDLE: idleHours * 60, STANDBY: 0 };
    return { ...day, idleHours, baselineIdleHours: baselineHours, excessIdleHours: avoidableHours,
      averageIdlePowerKw: idlePower, idleEnergyKwh: Number((idlePower * idleHours).toFixed(2)),
      necessaryIdleHours: baselineHours, potentiallyAvoidableHours: avoidableHours, unexplainedIdleHours: 0,
      avoidableIdleEnergyKwh: avoidableKwh, costImpactInr: Number((avoidableKwh * tariff).toFixed(2)),
      betweenJobsSharePercent: 100, stateMinutes, intervals };
  });
  return { ...diagnosis,
    status: "Potential Opportunity", title: "LC-01 excess idle opportunity",
    baselineIdleHours: baselineHours, averageIdleHoursPerDay: idleHours, excessIdleHoursPerDay: avoidableHours,
    averageIdlePowerKw: idlePower, idleEnergyKwhPerDay: Number((idlePower * idleHours).toFixed(2)),
    avoidableIdleHoursPerDay: avoidableHours, avoidableIdleEnergyKwhPerDay: avoidableKwh,
    dailyCostImpactInr: Number((avoidableKwh * tariff).toFixed(2)), monthlyEnergyKwh: monthlyKwh,
    monthlyImpactInr: Number((monthlyKwh * tariff).toFixed(2)),
    annualEnergyKwh: Number((monthlyKwh * 12).toFixed(2)), annualImpactInr: Number((monthlyKwh * 12 * tariff).toFixed(2)),
    betweenJobsSharePercent: 100, necessarySharePercent: Number((baselineHours / idleHours * 100).toFixed(1)),
    outputChangePercent: 0, confidence: lcScenario.confidence, recommendation: lcScenario.recommendedAction, operatorEventCount: Math.max(1, diagnosis.operatorEventCount),
    evidence: [
      `Demo scenario ${lcScenario.id}: ${idleHours} h/day idle vs ${baselineHours} h/day healthy baseline.`,
      `${avoidableHours} h/day excess at ${idlePower} kW = ${avoidableKwh} kWh/day candidate idle energy.`,
      `Operator reason ${lcScenario.operatorReason}; productive load ends at 21:20, then LC-01 holds near 9.8 kW.`,
      "Direct equipment meter and production-job context available; 94% interpretation confidence.",
      "This is a deterministic simulated presentation scenario, not a measured factory result."
    ],
    days: [...diagnosis.days.slice(0, -7), ...recentDays]
  } as T;
}
