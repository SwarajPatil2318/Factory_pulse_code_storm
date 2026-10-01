import "server-only";
import { prisma } from "@/lib/prisma";
import { DEMO_FACTORY_ID } from "@/lib/factory-model/schema";
import { getProductionEnergyModel } from "@/lib/production-energy/service";
import { rankMeasurements, type SenseCandidate } from "@/lib/sense-roi/calculation";

export async function getSenseRoi() {
  const run = await prisma.simulationRun.findFirst({ where: { factoryId: DEMO_FACTORY_ID, active: true }, orderBy: { generatedAt: "desc" } });
  if (!run) throw new Error("Simulation history is not ready. Run npm run sim:generate.");
  const recentStart = new Date(run.endAt.getTime() - 7 * 86_400_000);
  const [production, equipment, jobs, events] = await Promise.all([
    getProductionEnergyModel(),
    prisma.equipment.findMany({ where: { factoryId: DEMO_FACTORY_ID, status: "active" }, select: { id: true, code: true, name: true, equipmentType: true, parentFeederId: true, meteringMode: true } }),
    prisma.productionJob.findMany({ where: { runId: run.id, actualStart: { gte: recentStart } }, select: { equipmentId: true } }),
    prisma.operatorEvent.findMany({ where: { runId: run.id, startAt: { gte: recentStart } }, select: { equipmentId: true } })
  ]);
  const byCode = new Map(equipment.map((item) => [item.code, item]));
  const byId = new Map(equipment.map((item) => [item.id, item]));
  const candidates: SenseCandidate[] = production.assets.flatMap((assessment) => {
    const item = byCode.get(assessment.equipmentCode);
    if (!item || item.meteringMode === "DIRECT_METER" || !item.parentFeederId ||
      ["grid", "transformer", "main incomer", "distribution panel"].includes(item.equipmentType) ||
      assessment.state === "Normal" || (assessment.residualKwh ?? 0) <= 0 || assessment.comparableCount < 5) return [];
    const parent = byId.get(item.parentFeederId);
    return [{
      equipmentId: item.id, code: item.code, name: item.name, parentCode: parent?.code ?? null,
      meteringMode: item.meteringMode, sharedFeederMachines: equipment.filter((other) => other.parentFeederId === item.parentFeederId).length,
      recentJobCount: jobs.filter((job) => job.equipmentId === item.id).length,
      recentOperatorEventCount: events.filter((event) => event.equipmentId === item.id).length,
      healthyComparableCount: assessment.comparableCount, repeatCount: assessment.repeatCount,
      issueState: assessment.state, issueDetail: assessment.reasons.find((reason) => reason.includes("Baseline")) ?? "Production-aware SEC variance",
      dailyResidualKwh: assessment.residualKwh ?? 0
    }];
  });
  const recommendations = rankMeasurements(candidates);
  return {
    source: "SIMULATED" as const,
    title: "FactoryPulse Value-of-Information Demo Model",
    method: "Information value = positive annual SEC residual under investigation × expected confidence gain. SensorROI = information value ÷ seven-day meter cost. This is decision value, not a cash saving forecast.",
    sensorCostInr: 12000, durationDays: 7, tariffInrPerKwh: 9, productionDaysPerYear: 312,
    recommendations, best: recommendations.find((item) => item.measurementJustified) ?? null,
    directMeteredMachines: equipment.filter((item) => item.meteringMode === "DIRECT_METER" && !["distribution panel", "main incomer"].includes(item.equipmentType)).map((item) => item.code)
  };
}
