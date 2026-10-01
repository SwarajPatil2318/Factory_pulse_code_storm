import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEMO_FACTORY_ID } from "@/lib/factory-model/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const round = (n: number, d = 3) => Number(n.toFixed(d));

export async function GET() {
  try {
    const run = await prisma.simulationRun.findFirst({ where: { factoryId: DEMO_FACTORY_ID, active: true }, orderBy: { generatedAt: "desc" } });
    if (!run) return NextResponse.json({ error: "Simulation history is not ready. Run npm run sim:generate." }, { status: 503 });
    const [days, jobs, equipmentDays, equipment] = await Promise.all([
      prisma.simulationDay.findMany({ where: { runId: run.id }, orderBy: { day: "asc" } }),
      prisma.productionJob.findMany({ where: { runId: run.id }, orderBy: { actualStart: "desc" } }),
      prisma.simulationDaily.findMany({ where: { runId: run.id } }),
      prisma.equipment.findMany({ where: { factoryId: DEMO_FACTORY_ID }, select: { id: true, code: true } })
    ]);
    const codeById = new Map(equipment.map((item) => [item.id, item.code]));
    const process = ["LC-01", "LC-02", "WL-01", "PC-01"].map((code) => {
      const rows = jobs.filter((job) => codeById.get(job.equipmentId) === code);
      const energyKwh = rows.reduce((sum, row) => sum + row.energyKwh, 0);
      const goodUnits = rows.reduce((sum, row) => sum + row.goodUnits, 0);
      return { code, jobs: rows.length, kwhPerJob: rows.length ? round(energyKwh / rows.length) : null, kwhPerGoodComponent: goodUnits ? round(energyKwh / goodUnits) : null };
    });
    const compressorKwh = equipmentDays.filter((row) => codeById.get(row.equipmentId) === "AC-01").reduce((sum, row) => sum + row.energyKwh, 0);
    const productiveFactoryHours = equipmentDays.filter((row) => codeById.get(row.equipmentId) === "AS-01").reduce((sum, row) => sum + row.productiveMinutes / 60, 0);
    const rejected = jobs.filter((job) => codeById.get(job.equipmentId) === "AS-01").reduce((sum, job) => sum + job.rejectedUnits, 0);
    const quantity = jobs.filter((job) => codeById.get(job.equipmentId) === "AS-01").reduce((sum, job) => sum + job.quantity, 0);
    return NextResponse.json({
      source: "SIMULATED", disclaimer: "Demo / simulated data. No values are real factory measurements.",
      run: { startAt: run.startAt, endAt: run.endAt, intervalMinutes: run.intervalMinutes, baselineDays: run.baselineDays, liveUpdateSeconds: run.liveUpdateSeconds, liveStepMinutes: run.liveStepMinutes },
      daily: days.map((day) => ({ day: day.day, factoryKwh: day.factoryEnergyKwh, finishedGoodUnits: day.finishedGoodUnits, factorySec: day.factorySec, peakDemandKw: day.peakDemandKw })),
      kpis: { factorySecKwhPerFinishedGoodUnit: round(days.reduce((sum, day) => sum + day.factoryEnergyKwh, 0) / Math.max(1, days.reduce((sum, day) => sum + day.finishedGoodUnits, 0))), process, compressorKwhPerProductiveFactoryHour: round(compressorKwh / Math.max(0.1, productiveFactoryHours)), finishedGoodsRejectRate: round(rejected / Math.max(1, quantity) * 100, 2) },
      jobCount: jobs.length,
      jobs: jobs.slice(0, 36).map((job) => ({ jobId: job.id, productId: job.productId, productName: job.productName, quantity: job.quantity, machine: codeById.get(job.equipmentId), plannedStart: job.plannedStart, actualStart: job.actualStart, plannedEnd: job.plannedEnd, actualEnd: job.actualEnd, goodUnits: job.goodUnits, rejectedUnits: job.rejectedUnits, shift: job.shift, energyKwh: job.energyKwh, source: job.source }))
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Simulation summary unavailable" }, { status: 500 });
  }
}
