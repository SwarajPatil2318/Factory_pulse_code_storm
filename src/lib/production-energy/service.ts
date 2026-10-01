import "server-only";
import { prisma } from "@/lib/prisma";
import { DEMO_FACTORY_ID } from "@/lib/factory-model/schema";
import { localMidnightUtc } from "@/lib/simulation/generator";
import { assessEnergy, median, type EnergyObservation, type MeteringMode, type OutputUnit } from "@/lib/production-energy/calculation";

const key = (date: Date) => date.toISOString().slice(0, 10);
const rounded = (n: number) => Number(n.toFixed(3));

export async function getProductionEnergyModel() {
  const run = await prisma.simulationRun.findFirst({ where: { factoryId: DEMO_FACTORY_ID, active: true }, orderBy: { generatedAt: "desc" } });
  if (!run) throw new Error("Simulation history is not ready. Run npm run sim:generate.");
  const [equipment, jobs, equipmentDays, factoryDays, interruptions] = await Promise.all([
    prisma.equipment.findMany({ where: { factoryId: DEMO_FACTORY_ID }, select: { id: true, code: true, name: true, meteringMode: true } }),
    prisma.productionJob.findMany({ where: { runId: run.id }, orderBy: { actualStart: "asc" } }),
    prisma.simulationDaily.findMany({ where: { runId: run.id }, orderBy: { day: "asc" } }),
    prisma.simulationDay.findMany({ where: { runId: run.id }, orderBy: { day: "asc" } }),
    prisma.energyReading.findMany({ where: { runId: run.id, state: { in: ["FAULT", "MAINTENANCE"] } }, select: { equipmentId: true, timestamp: true, jobId: true } })
  ]);
  const byId = new Map(equipment.map((item) => [item.id, item]));
  const byCode = new Map(equipment.map((item) => [item.code, item]));
  const jobFaults = new Set(interruptions.map((row) => row.jobId).filter((id): id is string => Boolean(id)));
  const dayFaults = new Set(interruptions.map((row) => `${row.equipmentId}:${key(localMidnightUtc(row.timestamp))}`));
  const baselineEnd = new Date(run.startAt.getTime() + run.baselineDays * 86_400_000);
  const dailyByKey = new Map(equipmentDays.map((row) => [`${row.equipmentId}:${key(row.day)}`, row]));
  const jobsByEquipmentDay = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const mapKey = `${job.equipmentId}:${key(localMidnightUtc(job.actualStart))}`;
    const group = jobsByEquipmentDay.get(mapKey) ?? [];
    group.push(job); jobsByEquipmentDay.set(mapKey, group);
  }
  const baselineRows = equipmentDays.filter((row) => row.day < baselineEnd);
  const averageBatch = (rows: typeof jobs) => rows.length ? rows.reduce((sum, row) => sum + row.quantity, 0) / rows.length : 0;
  const productMix = (rows: typeof jobs) => {
    const total = rows.reduce((sum, row) => sum + row.goodUnits, 0);
    if (!total) return undefined;
    const mix: Record<string, number> = {};
    for (const row of rows) mix[row.productId] = (mix[row.productId] ?? 0) + row.goodUnits / total;
    return mix;
  };
  const baselineBatch = new Map(equipment.map((item) => [item.id, median(jobs.filter((job) => job.equipmentId === item.id && job.actualStart < baselineEnd).map((job) => job.quantity)) ?? 0]));
  const baselineIdle = new Map(equipment.map((item) => [item.id, median(baselineRows.filter((row) => row.equipmentId === item.id).map((row) => row.idleMinutes)) ?? 0]));
  const baselineRuntime = new Map(equipment.map((item) => [item.id, median(baselineRows.filter((row) => row.equipmentId === item.id).map((row) => row.productiveMinutes)) ?? 0]));
  const baselinePeak = median(factoryDays.filter((row) => row.day < baselineEnd).map((row) => row.peakDemandKw)) ?? 0;
  const baselineReject = median(factoryDays.filter((row) => row.day < baselineEnd).map((day) => {
    const assembly = byCode.get("AS-01");
    const rows = assembly ? jobsByEquipmentDay.get(`${assembly.id}:${key(day.day)}`) ?? [] : [];
    return rows.length ? rows.reduce((sum, job) => sum + job.rejectedUnits, 0) / Math.max(1, rows.reduce((sum, job) => sum + job.quantity, 0)) : 0;
  })) ?? 0;
  const factoryHours = new Map(factoryDays.map((day) => {
    const assembly = byCode.get("AS-01");
    return [key(day.day), assembly ? (dailyByKey.get(`${assembly.id}:${key(day.day)}`)?.productiveMinutes ?? 0) / 60 : 0] as const;
  }));

  const jobObservations: EnergyObservation[] = jobs.map((job) => {
    const equipmentItem = byId.get(job.equipmentId)!;
    const code = equipmentItem.code;
    const comparableBaseline = jobs.filter((candidate) => candidate.equipmentId === job.equipmentId && candidate.productId === job.productId && candidate.actualStart < baselineEnd);
    const typicalBatch = median(comparableBaseline.map((row) => row.quantity)) ?? 0;
    const rejectRate = job.rejectedUnits / Math.max(1, job.quantity);
    const contextSignals: string[] = [];
    if (typicalBatch > 0 && job.quantity < typicalBatch * 0.75) contextSignals.push(`Batch size is ${Math.round(job.quantity / typicalBatch * 100)}% of healthy ${code} jobs for this product.`);
    if (rejectRate > baselineReject + 0.04) contextSignals.push(`Rejected share is ${(rejectRate * 100).toFixed(1)}%, above the healthy production range.`);
    return {
      id: job.id, equipmentId: job.equipmentId, equipmentCode: code, productId: job.productId,
      quantity: job.quantity, batchSize: job.quantity, shift: job.shift,
      durationMinutes: (job.actualEnd.getTime() - job.actualStart.getTime()) / 60_000,
      energyKwh: job.energyKwh, usefulOutput: code.startsWith("LC-") ? (job.goodUnits > 0 ? 1 : 0) : job.goodUnits,
      outputUnit: code.startsWith("LC-") ? "good job" : code === "PC-01" ? "coated component" : code === "AS-01" ? "finished good unit" : "good component",
      at: job.actualEnd, healthy: rejectRate <= 0.04 && !jobFaults.has(job.id),
      meteringMode: equipmentItem.meteringMode as MeteringMode, contextSignals
    };
  });

  const dailyObservations: EnergyObservation[] = equipmentDays.map((day) => {
    const equipmentItem = byId.get(day.equipmentId)!;
    const code = equipmentItem.code;
    const dayKey = key(day.day);
    const localJobs = jobsByEquipmentDay.get(`${day.equipmentId}:${dayKey}`) ?? [];
    const assembly = byCode.get("AS-01");
    const factoryJobs = assembly ? jobsByEquipmentDay.get(`${assembly.id}:${dayKey}`) ?? [] : [];
    const hours = factoryHours.get(dayKey) ?? 0;
    const finished = factoryDays.find((factoryDay) => key(factoryDay.day) === dayKey)?.finishedGoodUnits ?? 0;
    const production = ["LC-01", "LC-02", "PB-01", "WL-01", "PC-01", "AS-01"].includes(code);
    const utility = ["AC-01", "CP-01", "LIGHTING", "OFFICE"].includes(code);
    const outputUnit: OutputUnit = code.startsWith("LC-") ? "good job" : code === "PC-01" ? "coated component" : code === "WL-01" || code === "PB-01" ? "good component" : utility ? "productive factory hour" : "finished good unit";
    const usefulOutput = code.startsWith("LC-") ? localJobs.filter((job) => job.goodUnits > 0).length : production ? localJobs.reduce((sum, job) => sum + job.goodUnits, 0) : utility ? hours : finished;
    const contextSignals: string[] = [];
    const typicalIdle = baselineIdle.get(day.equipmentId) ?? 0;
    if (day.idleMinutes > typicalIdle + 45 && day.idleMinutes > typicalIdle * 1.2) contextSignals.push(`Idle runtime rose to ${day.idleMinutes} minutes from a healthy median of ${typicalIdle} minutes.`);
    const typicalRuntime = baselineRuntime.get(day.equipmentId) ?? 0;
    if (code === "CP-01" && day.productiveMinutes > typicalRuntime + 60) contextSignals.push(`Pump runtime exceeds the healthy median by ${day.productiveMinutes - typicalRuntime} minutes.`);
    const batch = averageBatch(localJobs);
    if (code === "PC-01" && batch > 0 && batch < (baselineBatch.get(day.equipmentId) ?? 0) * 0.75) contextSignals.push(`Average coating batch is ${Math.round(batch)} parts, below the healthy batch size.`);
    if (code === "AS-01") {
      const rejected = localJobs.reduce((sum, job) => sum + job.rejectedUnits, 0);
      const quantity = localJobs.reduce((sum, job) => sum + job.quantity, 0);
      if (quantity && rejected / quantity > baselineReject + 0.04) contextSignals.push(`Finished-good rejection rose to ${(rejected / quantity * 100).toFixed(1)}%.`);
    }
    const factoryDay = factoryDays.find((row) => key(row.day) === dayKey);
    if (code === "M-01" && factoryDay && factoryDay.peakDemandKw > baselinePeak * 1.25) contextSignals.push(`Peak demand ${rounded(factoryDay.peakDemandKw)} kW exceeds the healthy peak by more than 25%.`);
    return {
      id: `${day.equipmentId}:${dayKey}`, equipmentId: day.equipmentId, equipmentCode: code,
      productId: "MIXED", productMix: productMix(production ? localJobs : factoryJobs), quantity: production ? localJobs.reduce((sum, job) => sum + job.quantity, 0) : finished,
      batchSize: production ? batch : finished, shift: "ALL", durationMinutes: utility ? hours * 60 : production ? day.productiveMinutes : hours * 60,
      energyKwh: day.energyKwh, usefulOutput, outputUnit, at: day.day,
      healthy: !dayFaults.has(`${day.equipmentId}:${dayKey}`) && (code !== "AS-01" || contextSignals.length === 0),
      meteringMode: equipmentItem.meteringMode as MeteringMode, contextSignals
    };
  });
  const factoryObservations: EnergyObservation[] = factoryDays.map((day) => {
    const dayKey = key(day.day);
    const assembly = byCode.get("AS-01");
    const localJobs = assembly ? jobsByEquipmentDay.get(`${assembly.id}:${dayKey}`) ?? [] : [];
    const rejected = localJobs.reduce((sum, job) => sum + job.rejectedUnits, 0);
    const quantity = localJobs.reduce((sum, job) => sum + job.quantity, 0);
    const rejectRate = quantity ? rejected / quantity : 0;
    const contextSignals = rejectRate > baselineReject + 0.04 ? [`Finished-good rejection is ${(rejectRate * 100).toFixed(1)}% versus ${(baselineReject * 100).toFixed(1)}% in healthy operation.`] : [];
    return {
      id: `factory:${dayKey}`, equipmentId: modelFactoryId(run.factoryId), equipmentCode: "FACTORY", productId: "MIXED", productMix: productMix(localJobs),
      quantity, batchSize: quantity, shift: "ALL", durationMinutes: (factoryHours.get(dayKey) ?? 0) * 60,
      energyKwh: day.factoryEnergyKwh, usefulOutput: day.finishedGoodUnits, outputUnit: "finished good unit", at: day.day,
      healthy: contextSignals.length === 0, meteringMode: byCode.get("M-01")?.meteringMode as MeteringMode ?? "INFERRED", contextSignals
    };
  });
  const baselineJobs = jobObservations.filter((row) => row.at < baselineEnd);
  const baselineDaily = dailyObservations.filter((row) => row.at < baselineEnd);
  const baselineFactory = factoryObservations.filter((row) => row.at < baselineEnd);
  const latestDay = factoryDays.at(-1)?.day;
  const assets = dailyObservations.filter((row) => latestDay && row.at.getTime() === latestDay.getTime()).map((row) => assessEnergy(row, baselineDaily, dailyObservations));
  const factory = factoryObservations.length ? assessEnergy(factoryObservations.at(-1)!, baselineFactory, factoryObservations) : null;
  const recentJobs = jobObservations.slice(-48).reverse().map((row) => assessEnergy(row, baselineJobs, jobObservations));
  const factoryTrend = factoryObservations.map((row) => assessEnergy(row, baselineFactory, factoryObservations));
  return {
    source: "SIMULATED" as const,
    disclaimer: "Demo / simulated data. Statistical deviations are not verified waste or savings.",
    method: { baselineDays: run.baselineDays, minimumComparables: 5, baseline: "Median SEC of comparable healthy historical observations", expected: "Baseline SEC × useful output", residual: "Actual energy − expected energy", deviation: "Residual ÷ expected energy × 100" },
    factory, assets, recentJobs, factoryTrend
  };
}

function modelFactoryId(id: string) { return `factory:${id}`; }
