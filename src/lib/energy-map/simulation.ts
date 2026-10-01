import "server-only";
import { prisma } from "@/lib/prisma";
import { assumptions, generateDay, localMidnightUtc, type SimReading, type SimState } from "@/lib/simulation/generator";
import type { getFactoryModel } from "@/lib/factory-model/service";
import type { EnergyMapSnapshot, EnergyNode, AnomalyStatus, VisualStatus } from "@/lib/energy-map/types";
import { LC01_EXCESS_IDLE_MATERIAL_WAIT as lcScenario, scenarioPowerDeltaKw } from "@/lib/simulation/lc01-demo-scenario";
import { isLc01ScenarioActive } from "@/lib/simulation/scenario-mode";

type Model = Awaited<ReturnType<typeof getFactoryModel>>;
const round = (value: number, places = 1) => Number(value.toFixed(places));
const timeLabel = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayLabel = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
const basis = (mode: string) => mode === "DIRECT_METER" ? "Direct meter" : mode === "FEEDER_METER" ? "Feeder-derived" : mode === "UNMETERED" ? "Unmetered · modeled" : "Inferred";
const confidence = (mode: string) => mode === "DIRECT_METER" ? 94 : mode === "FEEDER_METER" ? 76 : mode === "INFERRED" ? 54 : 28;

function issueFor(code: string, dayIndex: number, state: SimState): { anomaly: AnomalyStatus; text: string } {
  if (state === "OFF") return { anomaly: "normal", text: "No active issue detected" };
  const problems: Record<string, [number, AnomalyStatus, string]> = {
    "LC-01": [assumptions.issues.lc01ExcessIdleFromDay, "watch", "Idle time between production jobs exceeds baseline"],
    "AC-01": [assumptions.issues.ac01UnloadedFromDay, "confirmed", "Excess unloaded compressor runtime"],
    "PC-01": [assumptions.issues.pc01LowBatchFromDay, "watch", "Batch utilisation is below baseline"],
    "CP-01": [assumptions.issues.cp01AfterHoursFromDay, "watch", "Pump runtime continues after production"],
    "WL-01": [assumptions.issues.wl01SecDegradationFromDay, "watch", "Welding energy per good component is trending up"],
    "M-01": [Math.min(...assumptions.issues.simultaneousStartupDays), "watch", "Check peak demand around simultaneous shift startup"],
    "AS-01": [assumptions.issues.rejectReworkFromDay, "watch", "Rejected units increase energy per finished good unit"]
  };
  const entry = problems[code];
  return entry && dayIndex >= entry[0] ? { anomaly: entry[1], text: entry[2] } : { anomaly: "normal", text: "No active issue detected" };
}
function visual(state: SimState, anomaly: AnomalyStatus, mode: string): VisualStatus {
  if (state === "OFF") return "offline";
  if (anomaly === "confirmed") return "critical";
  if (anomaly === "watch") return "watch";
  if (mode === "INFERRED" || mode === "UNMETERED") return "inferred";
  return "normal";
}

export async function simulateEnergyMap(model: Model, now = new Date()): Promise<EnergyMapSnapshot> {
  const run = await prisma.simulationRun.findFirst({ where: { factoryId: model.factory.id, active: true }, orderBy: { generatedAt: "desc" } });
  if (!run) throw new Error("Simulation history is not ready. Run npm run sim:generate.");
  const scenarioActive = await isLc01ScenarioActive();
  const elapsedTicks = Math.max(0, Math.floor((now.getTime() - run.liveAnchorRealAt.getTime()) / (run.liveUpdateSeconds * 1000)));
  const simulatedAt = scenarioActive
    ? new Date(run.endAt.getTime() - 86_400_000 + (22 * 60 + 10) * 60_000)
    : new Date(run.liveAnchorSimAt.getTime() + elapsedTicks * run.liveStepMinutes * 60_000);
  const day = localMidnightUtc(simulatedAt);
  const dayIndex = Math.round((day.getTime() - run.startAt.getTime()) / 86_400_000);
  const generated = generateDay(model, day, dayIndex);
  const visibleReadings = generated.readings.filter((reading) => reading.timestamp <= simulatedAt);
  const grouped = new Map<string, SimReading[]>();
  for (const reading of visibleReadings) {
    const group = grouped.get(reading.equipmentId) ?? [];
    group.push(reading); grouped.set(reading.equipmentId, group);
  }
  if (scenarioActive) {
    const byCode = new Map(model.equipment.map((item) => [item.code, item]));
    const latest = grouped.get(byCode.get(lcScenario.equipmentId)?.id ?? "")?.at(-1);
    if (latest) {
      const deltaKw = lcScenario.currentPowerKw - latest.powerKw;
      latest.powerKw = lcScenario.currentPowerKw;
      latest.energyKwh = Number((latest.energyKwh + deltaKw * run.intervalMinutes / 60).toFixed(3));
      latest.state = lcScenario.state;
      // The feeder and ancestors receive the same instantaneous energy delta.
      for (const code of ["PF-01", "MDB-01", "M-01", "TR-01", "GRID"]) {
        const upstream = grouped.get(byCode.get(code)?.id ?? "")?.at(-1);
        if (upstream) {
          upstream.powerKw = Number((upstream.powerKw + deltaKw).toFixed(3));
          upstream.energyKwh = Number((upstream.energyKwh + deltaKw * run.intervalMinutes / 60).toFixed(3));
        }
      }
    }
    // Only instantaneous kW varies; the 5-minute kWh ledger stays at its
    // fixed scenario point. Carry each leaf's delta to every upstream node.
    const parentByChild = new Map(model.electricalConnections.map((edge) => [edge.targetEquipmentId, edge.sourceEquipmentId]));
    const nonLeafIds = new Set(model.electricalConnections.map((edge) => edge.sourceEquipmentId));
    model.equipment.forEach((item, index) => {
      if (item.code === lcScenario.equipmentId || nonLeafIds.has(item.id)) return;
      const reading = grouped.get(item.id)?.at(-1);
      if (!reading) return;
      const deltaKw = scenarioPowerDeltaKw(reading.powerKw, elapsedTicks, index);
      if (!deltaKw) return;
      reading.powerKw = Number((reading.powerKw + deltaKw).toFixed(3));
      let ancestor = parentByChild.get(item.id);
      const visited = new Set<string>();
      while (ancestor && !visited.has(ancestor)) {
        visited.add(ancestor);
        const upstream = grouped.get(ancestor)?.at(-1);
        if (upstream) upstream.powerKw = Number((upstream.powerKw + deltaKw).toFixed(3));
        ancestor = parentByChild.get(ancestor);
      }
    });
  }
  const lookback = new Date(day.getTime() - 7 * 86_400_000);
  const [history, baseline] = await Promise.all([
    prisma.simulationDaily.findMany({ where: { runId: run.id, day: { gte: lookback, lt: day } }, orderBy: { day: "asc" } }),
    prisma.simulationDaily.groupBy({ by: ["equipmentId"], where: { runId: run.id, day: { gte: run.startAt, lt: new Date(run.startAt.getTime() + run.baselineDays * 86_400_000) } }, _avg: { energyKwh: true } })
  ]);
  const byId = new Map(model.equipment.map((item) => [item.id, item]));
  const areaById = new Map(model.areas.map((item) => [item.id, item.name]));
  const meterById = new Map(model.meters.map((item) => [item.id, item.code]));
  const edges = model.electricalConnections.filter((edge) => byId.has(edge.sourceEquipmentId) && byId.has(edge.targetEquipmentId));
  const parent = new Map(edges.map((edge) => [edge.targetEquipmentId, edge.sourceEquipmentId]));
  const children = new Map(model.equipment.map((item) => [item.id, [] as string[]]));
  for (const edge of edges) children.get(edge.sourceEquipmentId)?.push(edge.targetEquipmentId);
  const energy = new Map(model.equipment.map((item) => [item.id, (grouped.get(item.id) ?? []).reduce((sum, reading) => sum + reading.energyKwh, 0)]));
  const main = model.equipment.find((item) => item.code === "M-01") ?? model.equipment.find((item) => item.code === "GRID");
  const plantTodayKwh = round(energy.get(main?.id ?? "") ?? 0);
  const plantCurrentKw = round(grouped.get(main?.id ?? "")?.at(-1)?.powerKw ?? 0);
  const finishedJobs = generated.jobs.filter((job) => byId.get(job.equipmentId)?.code === "AS-01" && job.actualEnd <= simulatedAt);
  const productionUnitsToday = finishedJobs.reduce((sum, job) => sum + job.goodUnits, 0);
  const nodes: EnergyNode[] = model.equipment.map((item) => {
    const readings = grouped.get(item.id) ?? [];
    const latest = readings.at(-1);
    const todayKwh = round(energy.get(item.id) ?? 0);
    const childIds = children.get(item.id) ?? [];
    const knownChildKwh = round(childIds.reduce((sum, id) => sum + (energy.get(id) ?? 0), 0));
    const unallocatedKwh = round(Math.max(0, todayKwh - knownChildKwh));
    const idleKwh = readings.filter((reading) => reading.state === "IDLE").reduce((sum, reading) => sum + reading.energyKwh, 0);
    const operatingHoursToday = readings.filter((reading) => !["OFF", "MAINTENANCE"].includes(reading.state)).length * run.intervalMinutes / 60;
    const baselineKwh = round((baseline.find((row) => row.equipmentId === item.id)?._avg.energyKwh ?? 0) * (readings.length / (1440 / run.intervalMinutes)));
    const { anomaly, text } = scenarioActive && item.code === lcScenario.equipmentId
      ? { anomaly: "watch" as const, text: `${lcScenario.anomaly}: ${lcScenario.observedIdleHoursPerDay} h/day observed vs ${lcScenario.healthyIdleHoursPerDay} h/day healthy; ${lcScenario.avoidableIdleHoursPerDay} h/day excess. ${lcScenario.operatorReason}. ${lcScenario.recommendedAction}.` }
      : issueFor(item.code, dayIndex, latest?.state ?? "OFF");
    let feederMeterCode: string | null = null;
    let ancestor = parent.get(item.id);
    const visited = new Set<string>();
    while (ancestor && !visited.has(ancestor)) {
      visited.add(ancestor);
      const upstream = byId.get(ancestor);
      if (upstream?.meterId) { feederMeterCode = meterById.get(upstream.meterId) ?? null; break; }
      ancestor = parent.get(ancestor);
    }
    const sevenDays = history.filter((row) => row.equipmentId === item.id).map((row) => ({ day: dayLabel.format(row.day), kwh: round(row.energyKwh) }));
    sevenDays.push({ day: dayLabel.format(day), kwh: todayKwh });
    const powerSeries = scenarioActive && item.code === lcScenario.equipmentId
      ? lcScenario.trend.map(({ time, kw }) => ({ time, kw }))
      : (() => {
        const samples = readings.filter((_, index) => index % 2 === 0).slice(-12);
        if (latest && samples.at(-1) !== latest) samples.push(latest);
        return samples.map((reading) => ({ time: timeLabel.format(reading.timestamp), kw: reading.powerKw }));
      })();
    const relatedJobs = generated.jobs.filter((job) => job.equipmentId === item.id && job.actualEnd <= simulatedAt);
    const goodUnits = relatedJobs.reduce((sum, job) => sum + job.goodUnits, 0);
    const jobEnergy = relatedJobs.reduce((sum, job) => sum + job.energyKwh, 0);
    const machineKpi = ["LC-01", "LC-02", "WL-01", "PC-01"].includes(item.code) && goodUnits ? {
      label: item.code.startsWith("LC") ? "Laser kWh / good component" : item.code === "WL-01" ? "Welding kWh / good component" : "Coating kWh / component",
      value: round(jobEnergy / goodUnits, 3), unit: "kWh/component",
      jobKwh: relatedJobs.length ? round(jobEnergy / relatedJobs.length, 2) : null
    } : item.code === "AC-01" ? { label: "Compressor kWh / productive factory hour", value: round(todayKwh / Math.max(0.1, (grouped.get(model.equipment.find((equipment) => equipment.code === "AS-01")?.id ?? "") ?? []).filter((r) => r.state === "PRODUCTIVE").length * run.intervalMinutes / 60), 2), unit: "kWh/hour", jobKwh: null } : null;
    return {
      id: item.id, code: item.code, name: item.name, equipmentType: item.equipmentType,
      areaId: item.areaId, areaName: areaById.get(item.areaId ?? "") ?? "Unassigned",
      parentId: parent.get(item.id) ?? null, childIds, meterId: item.meterId,
      meterCode: item.meterId ? meterById.get(item.meterId) ?? null : null, feederMeterCode,
      sensorCodes: model.sensors.filter((sensor) => sensor.equipmentId === item.id).map((sensor) => sensor.code),
      meteringMode: item.meteringMode, measurementBasis: basis(item.meteringMode), measurementConfidence: confidence(item.meteringMode),
      operatingState: latest?.state ?? "OFF", visualStatus: visual(latest?.state ?? "OFF", anomaly, item.meteringMode), anomalyStatus: anomaly,
      anomalyCode: scenarioActive && item.code === lcScenario.equipmentId ? lcScenario.anomaly : null,
      latestIssue: text, currentKw: latest?.powerKw ?? 0, todayKwh, costTodayInr: round(todayKwh * assumptions.tariffInrPerKwh, 0),
      percentPlant: plantTodayKwh ? round(todayKwh / plantTodayKwh * 100) : 0,
      secKwhPerPart: productionUnitsToday ? round(todayKwh / productionUnitsToday, 3) : 0,
      idleEnergyRatio: todayKwh ? round(idleKwh / todayKwh * 100) : 0,
      operatingHoursToday: round(operatingHoursToday, 2), baselineKwh,
      baselineDeltaPercent: baselineKwh ? round((todayKwh - baselineKwh) / baselineKwh * 100) : 0,
      knownChildKwh, unallocatedKwh, unallocatedPercent: todayKwh ? round(unallocatedKwh / todayKwh * 100) : 0,
      powerSeries, sevenDays, machineKpi
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const reference = main ? nodeById.get(main.id) : null;
  return {
    generatedAt: now.toISOString(), simulatedAt: simulatedAt.toISOString(), mode: "SIMULATION", scenarioId: scenarioActive ? lcScenario.id : null, source: "SIMULATED",
    factoryName: model.factory.name, factoryLocation: `${model.factory.city}, ${model.factory.state}`,
    tariffInrPerKwh: assumptions.tariffInrPerKwh, productionUnitsToday,
    factorySecKwhPerGoodUnit: productionUnitsToday ? round(plantTodayKwh / productionUnitsToday, 3) : null,
    accountingReferenceId: main?.id ?? null, plantCurrentKw, plantTodayKwh,
    plantCostTodayInr: round(plantTodayKwh * assumptions.tariffInrPerKwh, 0),
    unallocatedKwh: reference?.unallocatedKwh ?? 0, unallocatedPercent: reference?.unallocatedPercent ?? 0,
    nodes, connections: edges.map((edge) => ({ id: edge.id, sourceId: edge.sourceEquipmentId, targetId: edge.targetEquipmentId, connectionType: edge.connectionType, lossFactor: edge.lossFactor, flowKwh: nodeById.get(edge.targetEquipmentId)?.todayKwh ?? 0 })),
    areas: model.areas.map((area) => ({ id: area.id, name: area.name }))
  };
}
