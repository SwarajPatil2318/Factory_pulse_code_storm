import assumptions from "../../../data/demo-assumptions.json";

export { assumptions };
export type SimState = "OFF" | "STARTUP" | "SETUP" | "PRODUCTIVE" | "IDLE" | "STANDBY" | "FAULT" | "MAINTENANCE";
export type SimEquipment = { id: string; code: string; equipmentType: string; status: string };
export type SimConnection = { sourceEquipmentId: string; targetEquipmentId: string; lossFactor: number | null };
export type SimModel = { equipment: SimEquipment[]; electricalConnections: SimConnection[] };
export type SimReading = { equipmentId: string; timestamp: Date; state: SimState; operatingMode: string | null; powerKw: number; energyKwh: number; jobId: string | null; source: "SIMULATED" };
export type SimJob = { id: string; equipmentId: string; productId: string; productName: string; quantity: number; plannedStart: Date; actualStart: Date; plannedEnd: Date; actualEnd: Date; goodUnits: number; rejectedUnits: number; shift: string; energyKwh: number; source: "SIMULATED" };
export type SimDaily = { equipmentId: string; day: Date; energyKwh: number; maxPowerKw: number; productiveMinutes: number; idleMinutes: number; offMinutes: number; goodUnits: number };
export type GeneratedDay = { readings: SimReading[]; jobs: SimJob[]; equipmentDays: SimDaily[]; factoryDay: { day: Date; factoryEnergyKwh: number; finishedGoodUnits: number; factorySec: number | null; peakDemandKw: number; source: "SIMULATED" } };

const interval = assumptions.intervalMinutes;
const round = (n: number, d = 3) => Number(n.toFixed(d));
const noise = (a: number, b: number, c = 0) => { const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + assumptions.seed) * 43758.5453; return x - Math.floor(x); };
const ranged = (range: readonly number[], a: number, b: number, c = 0) => range[0] + (range[1] - range[0]) * noise(a, b, c);
const makeDate = (day: Date, minute: number) => new Date(day.getTime() + minute * 60_000);
const machineCodes = ["LC-01", "LC-02", "PB-01", "WL-01", "PC-01", "AS-01"];
const power = assumptions.powerKw as Record<string, Record<string, number[]>>;
const issues = assumptions.issues;

function createJobs(model: SimModel, day: Date, dayIndex: number): SimJob[] {
  const byCode = new Map(model.equipment.map((item) => [item.code, item]));
  const jobs: SimJob[] = [];
  for (const [machineIndex, code] of machineCodes.entries()) {
    const equipment = byCode.get(code);
    if (!equipment || equipment.status !== "active") continue;
    for (const shift of assumptions.shifts) for (let slot = 0; slot < 3; slot++) {
      const product = assumptions.products[(dayIndex + machineIndex + slot + (shift.name === "B" ? 2 : 0)) % assumptions.products.length];
      const slow = code === "LC-01" && dayIndex >= issues.lc01ExcessIdleFromDay;
      const plannedMinute = shift.startMinute + 25 + slot * 145;
      const actualMinute = shift.startMinute + 25 + slot * (slow ? 166 : 145) + Math.floor(noise(dayIndex, machineIndex, slot) * 8);
      const duration = code === "PC-01" ? 100 : slow ? 92 : 112;
      const batchFactor = code === "PC-01" && dayIndex >= issues.pc01LowBatchFromDay ? 0.61 : 1;
      const quantity = Math.max(1, Math.round(product.baseQuantity * batchFactor * (0.93 + noise(dayIndex, slot, machineIndex) * 0.14)));
      const rejectRange = dayIndex >= issues.rejectReworkFromDay ? assumptions.rejectRateAfterIssue : assumptions.rejectRateBaseline;
      const rejectedUnits = Math.max(0, Math.round(quantity * ranged(rejectRange, dayIndex, slot, machineIndex)));
      jobs.push({
        id: `JOB-${String(dayIndex + 1).padStart(2, "0")}-${code}-${shift.name}${slot + 1}`,
        equipmentId: equipment.id, productId: product.id, productName: product.name, quantity,
        plannedStart: makeDate(day, plannedMinute), actualStart: makeDate(day, actualMinute),
        plannedEnd: makeDate(day, plannedMinute + duration), actualEnd: makeDate(day, actualMinute + duration),
        goodUnits: quantity - rejectedUnits, rejectedUnits, shift: shift.name, energyKwh: 0, source: "SIMULATED"
      });
    }
  }
  return jobs;
}

function leafReading(item: SimEquipment, minute: number, tick: number, dayIndex: number, jobs: SimJob[], day: Date): Omit<SimReading, "equipmentId" | "timestamp" | "energyKwh" | "source"> {
  if (item.status !== "active") return { state: "OFF", operatingMode: null, powerKw: 0, jobId: null };
  const code = item.code;
  const shift = assumptions.shifts.find((s) => minute >= s.startMinute && minute < s.endMinute);
  const active = Boolean(shift);
  const localJob = jobs.find((job) => job.equipmentId === item.id && makeDate(day, minute) >= job.actualStart && makeDate(day, minute) < job.actualEnd);
  const upcoming = jobs.find((job) => job.equipmentId === item.id && makeDate(day, minute) < job.actualStart && makeDate(day, minute + 10) >= job.actualStart);
  const shiftStart = shift ? minute - shift.startMinute : -1;
  const spike = issues.simultaneousStartupDays.includes(dayIndex) && shiftStart >= 0 && shiftStart < 10;
  const fault = active && dayIndex % 11 === 6 && minute === 655 && ["LC-02", "PB-01"].includes(code);
  const maintenance = active && dayIndex % 7 === 6 && minute >= 1280 && ["LC-02", "PB-01", "WL-01"].includes(code);
  let state: SimState = "OFF";
  let operatingMode: string | null = null;
  if (fault) state = "FAULT";
  else if (maintenance) state = "MAINTENANCE";
  else if (code === "LIGHTING" || code === "OFFICE") state = active ? "PRODUCTIVE" : "STANDBY";
  else if (code === "CP-01") state = active || (dayIndex >= issues.cp01AfterHoursFromDay && minute >= 1320 && minute < 1440) ? "PRODUCTIVE" : "OFF";
  else if (code === "AC-01") {
    if (shiftStart >= 0 && shiftStart < 10) state = "STARTUP";
    else if (active) state = (tick % 9) < (dayIndex >= issues.ac01UnloadedFromDay ? 3 : 2) ? "IDLE" : "PRODUCTIVE";
    else if (dayIndex >= issues.ac01UnloadedFromDay && (minute < 360 || minute >= 1320)) state = "IDLE";
    else state = "OFF";
    operatingMode = state === "PRODUCTIVE" ? "LOADED" : state === "IDLE" ? "UNLOADED" : state;
  } else if (code === "PC-01") {
    if (shiftStart >= 0 && shiftStart < 20) { state = "STARTUP"; operatingMode = "HEATING"; }
    else if (localJob && minute % 145 < 25) { state = "PRODUCTIVE"; operatingMode = "HEATING"; }
    else if (localJob) { state = "PRODUCTIVE"; operatingMode = "HOLDING"; }
    else if (active) { state = "IDLE"; operatingMode = "IDLE"; }
  } else if (active && shiftStart >= 0 && shiftStart < 10) state = "STARTUP";
  else if (localJob) state = "PRODUCTIVE";
  else if (upcoming) state = "SETUP";
  else if (active) state = minute > 1290 ? "STANDBY" : "IDLE";

  let range: number[] | undefined;
  if (code === "LIGHTING" || code === "OFFICE") range = power[code]?.[active ? "DAY" : "NIGHT"];
  else if (code === "AC-01") range = power[code]?.[operatingMode ?? state];
  else if (code === "PC-01") range = power[code]?.[operatingMode ?? state];
  else if (code === "CP-01") range = power[code]?.[state === "PRODUCTIVE" ? "RUNNING" : "OFF"];
  else range = power[code]?.[state];
  range ??= assumptions.defaultPowerKw[state];
  let powerKw = ranged(range, dayIndex, tick, code.length + code.charCodeAt(0));
  if (state === "OFF") powerKw = ranged(assumptions.defaultPowerKw.OFF, dayIndex, tick, code.length);
  if (state === "FAULT" || state === "MAINTENANCE" || state === "STANDBY") powerKw = ranged(assumptions.defaultPowerKw[state], dayIndex, tick, code.length);
  if (code === "WL-01" && state === "PRODUCTIVE" && dayIndex >= issues.wl01SecDegradationFromDay) powerKw *= 1 + Math.min(0.25, (dayIndex - issues.wl01SecDegradationFromDay + 1) * 0.016);
  if (spike && state === "STARTUP") powerKw = Math.max(powerKw, ranged(power[code]?.PRODUCTIVE ?? assumptions.defaultPowerKw.STARTUP, dayIndex, tick, code.length) * 2.3);
  return { state, operatingMode, powerKw: round(powerKw), jobId: localJob?.id ?? null };
}

export function generateDay(model: SimModel, day: Date, dayIndex: number): GeneratedDay {
  const jobs = createJobs(model, day, dayIndex);
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const byId = new Map(model.equipment.map((item) => [item.id, item]));
  const children = new Map(model.equipment.map((item) => [item.id, [] as SimConnection[]]));
  for (const edge of model.electricalConnections) if (byId.has(edge.sourceEquipmentId) && byId.has(edge.targetEquipmentId)) children.get(edge.sourceEquipmentId)?.push(edge);
  const readings: SimReading[] = [];
  const accum = new Map(model.equipment.map((item) => [item.id, { energyKwh: 0, maxPowerKw: 0, productiveMinutes: 0, idleMinutes: 0, offMinutes: 0 }]));
  for (let tick = 0; tick < 1440 / interval; tick++) {
    const minute = tick * interval;
    const timestamp = makeDate(day, minute);
    const current = new Map<string, SimReading>();
    const visiting = new Set<string>();
    const calculate = (item: SimEquipment): SimReading => {
      const cached = current.get(item.id);
      if (cached) return cached;
      if (visiting.has(item.id)) throw new Error(`Electrical topology cycle at ${item.code}`);
      visiting.add(item.id);
      const downstream = children.get(item.id) ?? [];
      let state: SimState, operatingMode: string | null, powerKw: number, jobId: string | null;
      if (downstream.length) {
        const sum = downstream.reduce((total, edge) => total + calculate(byId.get(edge.targetEquipmentId)!).powerKw * (1 + (edge.lossFactor ?? 0)), 0);
        const gap = (assumptions.unallocatedFraction as Record<string, number>)[item.code] ?? 0.02;
        powerKw = item.status === "active" ? round(sum / (1 - gap)) : 0;
        state = powerKw > 1 ? "PRODUCTIVE" : "OFF";
        operatingMode = "DISTRIBUTION";
        jobId = null;
      } else {
        const leaf = leafReading(item, minute, tick, dayIndex, jobs, day);
        ({ state, operatingMode, powerKw, jobId } = leaf);
      }
      const energyKwh = round(powerKw * interval / 60, 5);
      const reading: SimReading = { equipmentId: item.id, timestamp, state, operatingMode, powerKw, energyKwh, jobId, source: "SIMULATED" };
      current.set(item.id, reading);
      visiting.delete(item.id);
      const daily = accum.get(item.id)!;
      daily.energyKwh += energyKwh;
      daily.maxPowerKw = Math.max(daily.maxPowerKw, powerKw);
      if (state === "PRODUCTIVE") daily.productiveMinutes += interval;
      if (state === "IDLE") daily.idleMinutes += interval;
      if (state === "OFF") daily.offMinutes += interval;
      if (jobId) jobById.get(jobId)!.energyKwh += energyKwh;
      return reading;
    };
    for (const item of model.equipment) calculate(item);
    readings.push(...current.values());
  }
  const equipmentDays = model.equipment.map((item) => ({ equipmentId: item.id, day, ...accum.get(item.id)!, energyKwh: round(accum.get(item.id)!.energyKwh), goodUnits: jobs.filter((job) => job.equipmentId === item.id).reduce((sum, job) => sum + job.goodUnits, 0) }));
  const main = model.equipment.find((item) => item.code === "M-01");
  const mainDaily = equipmentDays.find((item) => item.equipmentId === main?.id);
  const finishedGoodUnits = jobs.filter((job) => model.equipment.find((item) => item.id === job.equipmentId)?.code === "AS-01").reduce((sum, job) => sum + job.goodUnits, 0);
  for (const job of jobs) job.energyKwh = round(job.energyKwh);
  const factoryEnergyKwh = mainDaily?.energyKwh ?? 0;
  return { readings, jobs, equipmentDays, factoryDay: { day, factoryEnergyKwh, finishedGoodUnits, factorySec: finishedGoodUnits ? round(factoryEnergyKwh / finishedGoodUnits, 4) : null, peakDemandKw: mainDaily?.maxPowerKw ?? 0, source: "SIMULATED" } };
}

export function localMidnightUtc(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), -5, -30));
}
