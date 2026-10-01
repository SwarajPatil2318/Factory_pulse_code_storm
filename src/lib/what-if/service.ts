import "server-only";
import { prisma } from "@/lib/prisma";
import { DEMO_FACTORY_ID } from "@/lib/factory-model/schema";
import { assumptions } from "@/lib/simulation/generator";
import { getMachineStateDiagnostics } from "@/lib/machine-state/service";
import type { WhatIfBaseline } from "@/lib/what-if/model";
import { projectLc01Reading, LC01_EXCESS_IDLE_MATERIAL_WAIT as lcScenario } from "@/lib/simulation/lc01-demo-scenario";
import { isLc01ScenarioActive } from "@/lib/simulation/scenario-mode";

const round = (value: number) => Number(value.toFixed(3));
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export async function getWhatIfBaseline(): Promise<WhatIfBaseline> {
  const run = await prisma.simulationRun.findFirst({ where: { factoryId: DEMO_FACTORY_ID, active: true }, orderBy: { generatedAt: "desc" } });
  if (!run) throw new Error("Simulation history is not ready. Run npm run sim:generate.");
  const [equipment, latestDay, diagnostics] = await Promise.all([
    prisma.equipment.findMany({ where: { factoryId: DEMO_FACTORY_ID, code: { in: ["LC-01", "AC-01", "PC-01"] } }, select: { id: true, code: true } }),
    prisma.simulationDay.findFirst({ where: { runId: run.id }, orderBy: { day: "desc" }, select: { day: true } }),
    getMachineStateDiagnostics()
  ]);
  if (!latestDay || equipment.length !== 3) throw new Error("The demo simulation is incomplete.");
  const recentDays = 7;
  const startAt = new Date(latestDay.day.getTime() - (recentDays - 1) * 86_400_000);
  const endAt = new Date(latestDay.day.getTime() + 86_400_000);
  const ids = equipment.map((item) => item.id);
  const [readings, jobs, healthyCoatingJobs] = await Promise.all([
    prisma.energyReading.findMany({ where: { runId: run.id, equipmentId: { in: ids }, timestamp: { gte: startAt, lt: endAt } }, select: { timestamp: true, equipmentId: true, state: true, operatingMode: true, powerKw: true, energyKwh: true } }),
    prisma.productionJob.findMany({ where: { runId: run.id, equipmentId: { in: ids }, actualStart: { gte: startAt, lt: endAt } }, select: { equipmentId: true, goodUnits: true, quantity: true } }),
    prisma.productionJob.findMany({ where: { runId: run.id, equipmentId: equipment.find((item) => item.code === "PC-01")!.id, actualStart: { lt: new Date(run.startAt.getTime() + run.baselineDays * 86_400_000) } }, select: { quantity: true } })
  ]);
  const id = (code: string) => equipment.find((item) => item.code === code)!.id;
  const rows = (code: string) => readings.filter((row) => row.equipmentId === id(code));
  const jobRows = (code: string) => jobs.filter((row) => row.equipmentId === id(code));
  const scenarioActive = await isLc01ScenarioActive();
  const lcRows = scenarioActive ? rows("LC-01").map((row) => projectLc01Reading(row, run.intervalMinutes)) : rows("LC-01");
  const lcIdle = lcRows.filter((row) => row.state === "IDLE" || row.state === "STANDBY");
  const lcProductive = lcRows.filter((row) => row.state === "PRODUCTIVE");
  const lcDailyEnergy = sum(lcRows.map((row) => row.energyKwh)) / recentDays;
  const lcProductiveEnergy = sum(lcProductive.map((row) => row.energyKwh)) / recentDays;
  const lcIdleEnergy = sum(lcIdle.map((row) => row.energyKwh)) / recentDays;
  const lcProductiveHours = lcProductive.length * run.intervalMinutes / 60 / recentDays;
  const lcIdleHours = scenarioActive ? lcScenario.observedIdleHoursPerDay : lcIdle.length * run.intervalMinutes / 60 / recentDays;
  const lcJobs = jobRows("LC-01").filter((job) => job.goodUnits > 0).length / recentDays;
  const lcDiagnosis = diagnostics.diagnoses.find((item) => item.code === "LC-01");
  const acRows = rows("AC-01");
  const acUnload = acRows.filter((row) => row.operatingMode === "UNLOADED");
  const acDiagnosis = diagnostics.diagnoses.find((item) => item.code === "AC-01");
  const pcRows = rows("PC-01");
  const pcJobs = jobRows("PC-01");
  const pcDailyEnergy = sum(pcRows.map((row) => row.energyKwh)) / recentDays;
  const pcComponents = sum(pcJobs.map((job) => job.goodUnits)) / recentDays;
  const pcBatches = pcJobs.length / recentDays;
  const currentBatch = pcBatches > 0 ? pcComponents / pcBatches : 0;
  const sortedHealthy = healthyCoatingJobs.map((job) => job.quantity).sort((a, b) => a - b);
  const referenceCapacity = sortedHealthy.length ? sortedHealthy[Math.min(sortedHealthy.length - 1, Math.floor(sortedHealthy.length * .9))] : Math.max(1, currentBatch);
  // Heating plus non-job idle approximates fixed oven energy per batch; the rest scales with good components.
  const fixedDailyEnergy = sum(pcRows.filter((row) => row.operatingMode === "HEATING" || row.state === "IDLE").map((row) => row.energyKwh)) / recentDays;
  const fixedPerBatch = pcBatches > 0 ? Math.min(pcDailyEnergy / pcBatches, fixedDailyEnergy / pcBatches) : 0;
  const variablePerComponent = pcComponents > 0 ? Math.max(0, (pcDailyEnergy - fixedPerBatch * pcBatches) / pcComponents) : 0;
  return {
    source: "SIMULATED", recentDays, productionDaysPerYear: assumptions.productionDaysPerMonth * 12, tariffInrPerKwh: 9,
    lc: {
      dailyEnergyKwh: round(lcDailyEnergy), dailyProductiveEnergyKwh: round(lcProductiveEnergy), dailyIdleEnergyKwh: round(lcIdleEnergy), dailyOtherEnergyKwh: round(Math.max(0, lcDailyEnergy - lcProductiveEnergy - lcIdleEnergy)),
      productiveHoursPerDay: round(lcProductiveHours), idleHoursPerDay: round(lcIdleHours), avoidableIdleHoursPerDay: round(scenarioActive ? lcScenario.avoidableIdleHoursPerDay : Math.min(lcIdleHours, lcDiagnosis?.avoidableIdleHoursPerDay ?? 0)),
      avoidableIdleEnergyKwhPerDay: round(scenarioActive ? lcScenario.avoidableIdleHoursPerDay * lcScenario.currentPowerKw : Math.min(lcIdleEnergy, lcDiagnosis?.avoidableIdleEnergyKwhPerDay ?? 0)), idlePowerKw: round(scenarioActive ? lcScenario.currentPowerKw : lcDiagnosis?.averageIdlePowerKw ?? (lcIdleHours ? lcIdleEnergy / lcIdleHours : 0)),
      jobsPerDay: round(lcJobs), jobsPerProductiveHour: round(lcProductiveHours ? lcJobs / lcProductiveHours : 0)
    },
    ac: { dailyEnergyKwh: round(sum(acRows.map((row) => row.energyKwh)) / recentDays), unloadHoursPerDay: round(acUnload.length * run.intervalMinutes / 60 / recentDays), unloadPowerKw: round(acUnload.length ? sum(acUnload.map((row) => row.powerKw)) / acUnload.length : 0), avoidableUnloadHoursPerDay: round(acDiagnosis?.avoidableIdleHoursPerDay ?? 0), avoidableUnloadEnergyKwhPerDay: round(acDiagnosis?.avoidableIdleEnergyKwhPerDay ?? 0) },
    pc: { dailyEnergyKwh: round(pcDailyEnergy), componentsPerDay: round(pcComponents), batchesPerDay: round(pcBatches), currentComponentsPerBatch: round(currentBatch), referenceCapacityComponents: round(referenceCapacity), currentUtilisationPercent: round(Math.min(100, currentBatch / Math.max(1, referenceCapacity) * 100)), fixedEnergyPerBatchKwh: round(fixedPerBatch), variableEnergyPerComponentKwh: round(variablePerComponent) }
  };
}
