import { prisma } from "../src/lib/prisma";
import { ensureDemoFactory } from "../src/lib/factory-model/seed";
import { DEMO_FACTORY_ID } from "../src/lib/factory-model/schema";
import { assumptions, generateDay, localMidnightUtc } from "../src/lib/simulation/generator";
import { generateOperatorContext } from "../src/lib/simulation/operator-context";

async function main() {
  await ensureDemoFactory();
  const today = localMidnightUtc();
  const startAt = new Date(today.getTime() - assumptions.historyDays * 86_400_000);
  const existing = await prisma.simulationRun.findFirst({ where: { factoryId: DEMO_FACTORY_ID, active: true }, orderBy: { generatedAt: "desc" } });
  if (existing && existing.endAt.getTime() === today.getTime() && !process.argv.includes("--replace")) {
    console.log(`Existing ${assumptions.historyDays}-day simulated run ${existing.id} is current. Use --replace to regenerate.`);
    return;
  }
  const model = await prisma.factory.findUniqueOrThrow({ where: { id: DEMO_FACTORY_ID }, include: { equipment: true, electricalConnections: true } });
  const run = await prisma.simulationRun.create({ data: {
    factoryId: DEMO_FACTORY_ID, startAt, endAt: today, baselineDays: assumptions.baselineDays,
    intervalMinutes: assumptions.intervalMinutes, liveUpdateSeconds: assumptions.liveUpdateSeconds,
    liveStepMinutes: assumptions.liveStepMinutes, liveAnchorRealAt: new Date(),
    liveAnchorSimAt: new Date(today.getTime() + assumptions.liveStartLocalHour * 3_600_000),
    seed: assumptions.seed, assumptionsVersion: assumptions.version, source: "SIMULATED", active: false
  } });
  try {
    for (let index = 0; index < assumptions.historyDays; index++) {
      const day = new Date(startAt.getTime() + index * 86_400_000);
      const generated = generateDay(model, day, index);
      for (let offset = 0; offset < generated.readings.length; offset += 1000) {
        await prisma.energyReading.createMany({ data: generated.readings.slice(offset, offset + 1000).map((reading) => ({ ...reading, jobId: reading.jobId ? `${run.id}-${reading.jobId}` : null, runId: run.id })) });
      }
      await prisma.productionJob.createMany({ data: generated.jobs.map((job) => ({ ...job, id: `${run.id}-${job.id}`, runId: run.id })) });
      await prisma.simulationDaily.createMany({ data: generated.equipmentDays.map((daily) => ({ ...daily, runId: run.id })) });
      await prisma.simulationDay.create({ data: { ...generated.factoryDay, runId: run.id } });
      const context = generateOperatorContext(model, generated.jobs, day, index);
      await prisma.operatorEvent.createMany({ data: context.events.map((event) => ({ ...event, runId: run.id })) });
      await prisma.machineStateSignal.createMany({ data: context.signals.map((signal) => ({ ...signal, runId: run.id })) });
      console.log(`Simulated day ${String(index + 1).padStart(2, "0")}/${assumptions.historyDays}: ${generated.readings.length} readings, ${generated.jobs.length} jobs`);
    }
    await prisma.$transaction([
      prisma.simulationRun.updateMany({ where: { factoryId: DEMO_FACTORY_ID, active: true }, data: { active: false } }),
      prisma.simulationRun.update({ where: { id: run.id }, data: { active: true } })
    ]);
    await prisma.simulationRun.deleteMany({ where: { factoryId: DEMO_FACTORY_ID, active: false } });
    console.log(`Ready: ${run.id}. All readings and jobs are Demo / simulated data.`);
  } catch (error) {
    await prisma.simulationRun.delete({ where: { id: run.id } });
    throw error;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
