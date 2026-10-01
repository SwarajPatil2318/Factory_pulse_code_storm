import "server-only";
import { prisma } from "@/lib/prisma";
import { DEMO_FACTORY_ID } from "@/lib/factory-model/schema";
import { getMachineStateDiagnostics } from "@/lib/machine-state/service";
import { verifyMaterialStaging } from "@/lib/verification/calculation";
import { interventions } from "../../../data/interventions";
import { isLc01ScenarioActive } from "@/lib/simulation/scenario-mode";
import { projectLc01Reading } from "@/lib/simulation/lc01-demo-scenario";

export async function getVerificationDemo() {
  const run = await prisma.simulationRun.findFirst({ where: { factoryId: DEMO_FACTORY_ID, active: true }, orderBy: { generatedAt: "desc" } });
  if (!run) throw new Error("Simulation history is not ready. Run npm run sim:generate.");
  const equipment = await prisma.equipment.findFirst({ where: { factoryId: DEMO_FACTORY_ID, code: "LC-01" }, select: { id: true } });
  if (!equipment) throw new Error("LC-01 is not configured in Factory Setup.");
  const scenarioActive = await isLc01ScenarioActive();
  const startAt = new Date(run.endAt.getTime() - 7 * 86_400_000);
  const [diagnostics, readings, jobs] = await Promise.all([
    getMachineStateDiagnostics(),
    prisma.energyReading.findMany({ where: { runId: run.id, equipmentId: equipment.id, timestamp: { gte: startAt, lt: run.endAt } }, select: { timestamp: true, powerKw: true, energyKwh: true, state: true }, orderBy: { timestamp: "asc" } }),
    prisma.productionJob.findMany({ where: { runId: run.id, equipmentId: equipment.id, actualStart: { gte: startAt, lt: run.endAt } }, select: { id: true, actualStart: true, quantity: true, goodUnits: true, rejectedUnits: true }, orderBy: { actualStart: "asc" } })
  ]);
  const lc = diagnostics.diagnoses.find((item) => item.code === "LC-01");
  const intervention = interventions.find((item) => item.id === "lc-staging");
  if (!lc || !intervention || readings.length < 7 * 24 * 60 / run.intervalMinutes || !jobs.length) throw new Error("LC-01 verification needs a complete seven-day simulated baseline.");
  const beforeReadings = scenarioActive ? readings.map((row) => projectLc01Reading(row, run.intervalMinutes)) : readings;
  return verifyMaterialStaging({
    beforeStartAt: startAt.toISOString(), intervalMinutes: run.intervalMinutes,
    readings: beforeReadings.map((row) => ({ timestamp: row.timestamp.toISOString(), powerKw: row.powerKw, energyKwh: row.energyKwh, state: row.state })),
    jobs: jobs.map((job) => ({ id: job.id, actualStart: job.actualStart.toISOString(), quantity: job.quantity, goodUnits: job.goodUnits, rejectedUnits: job.rejectedUnits })),
    candidateIntervals: lc.days.slice(-7).flatMap((day) => day.intervals.map((interval) => ({ at: interval.at, idleClass: interval.idleClass, reasonCode: interval.reasonCode }))),
    targetIdleReduction: (intervention.reductionLow + intervention.reductionHigh) / 2,
    predictedReductionLow: intervention.reductionLow, predictedReductionHigh: intervention.reductionHigh,
    diagnosticConfidence: lc.confidence, diagnosedAvoidableIdleKwhPerDay: lc.avoidableIdleEnergyKwhPerDay, tariffInrPerKwh: 9, productionDaysPerYear: 26 * 12,
    capexInr: intervention.capexInr, operatorEventCount: lc.operatorEventCount
  });
}
