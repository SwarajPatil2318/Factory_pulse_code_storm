import { median } from "../production-energy/calculation";
import { recommendationForReason } from "../operator-intelligence/rules";

export type MachineState = "OFF" | "SETUP" | "PRODUCTIVE" | "IDLE" | "STANDBY" | "FAULT";
export type IdleClass = "Necessary" | "Potentially Avoidable" | "Unexplained";
export type StateReading = { timestamp: Date; powerKw: number; simulatedState?: string };
export type StateJob = { id: string; actualStart: Date; actualEnd: Date; goodUnits: number; shift: string };
export type StateSignal = { startAt: Date; endAt: Date; state: string; source: string };
export type StateEvent = { startAt: Date; endAt: Date; reasonCode: string; note?: string | null; source: string };
export type PowerRange = readonly [number, number];
export type MachineProfile = {
  code: string;
  productiveKw: PowerRange;
  idleKw: PowerRange;
  setupKw?: PowerRange;
  offBelowKw: number;
  intervalMinutes: number;
  shiftWindows: ReadonlyArray<{ startMinute: number; endMinute: number }>;
  tariffInrPerKwh: number;
  productionDaysPerMonth: number;
  meteringBasis: string;
  productiveWithoutJob?: boolean;
};
export type InterpretedInterval = {
  at: string;
  powerKw: number;
  state: MachineState;
  idleClass: IdleClass | null;
  reasonCode: string | null;
  evidence: string[];
  activeJobId: string | null;
  signalSource: string | null;
  operatorEventSource: string | null;
  recommendation: string | null;
  withoutOperatorContextReason: string | null;
};
export type MachineDay = {
  day: string;
  idleHours: number;
  baselineIdleHours: number;
  excessIdleHours: number;
  averageIdlePowerKw: number;
  idleEnergyKwh: number;
  necessaryIdleHours: number;
  potentiallyAvoidableHours: number;
  unexplainedIdleHours: number;
  avoidableIdleEnergyKwh: number;
  costImpactInr: number;
  goodOutput: number;
  jobCount: number;
  betweenJobsSharePercent: number;
  stateMinutes: Record<MachineState, number>;
  intervals: InterpretedInterval[];
};
export type MachineDiagnosis = {
  code: string;
  status: "Within Baseline" | "Needs Context" | "Potential Opportunity";
  title: string;
  baselineIdleHours: number;
  baselineGapMinutes: number;
  averageIdleHoursPerDay: number;
  excessIdleHoursPerDay: number;
  averageIdlePowerKw: number;
  idleEnergyKwhPerDay: number;
  avoidableIdleHoursPerDay: number;
  avoidableIdleEnergyKwhPerDay: number;
  dailyCostImpactInr: number;
  monthlyEnergyKwh: number;
  monthlyImpactInr: number;
  annualEnergyKwh: number;
  annualImpactInr: number;
  outputChangePercent: number | null;
  betweenJobsSharePercent: number;
  necessarySharePercent: number;
  signalCoveragePercent: number;
  operatorEventCount: number;
  confidence: number;
  evidence: string[];
  recommendation: string;
  days: MachineDay[];
  source: "SIMULATED";
};

const necessaryCodes = new Set(["TOOL_SETUP", "SCHEDULED_INSPECTION", "LOADING_UNLOADING", "MANDATED_COOLING", "SETUP_CHANGEOVER", "TOOL_CHANGE", "QUALITY_INSPECTION", "MAINTENANCE"]);
const avoidableCodes = new Set(["WAITING_FOR_MATERIAL", "JOB_SCHEDULING_GAP", "LUNCH_STANDBY", "UPSTREAM_DELAY", "DOWNSTREAM_DELAY", "LEFT_ENERGIZED_AFTER_SHIFT", "MATERIAL_UNAVAILABLE", "WAITING_DOWNSTREAM", "WAITING_UPSTREAM", "LUNCH_SHIFT_BREAK", "OPERATOR_UNAVAILABLE", "UTILITY_ISSUE"]);
const round = (n: number, places = 2) => Number(n.toFixed(places));
const inRange = (value: number, range: PowerRange) => value >= range[0] && value <= range[1];
const overlaps = (at: Date, startAt: Date, endAt: Date) => at >= startAt && at < endAt;
const istFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const localParts = (at: Date) => {
  const parts = istFormatter.formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { day: `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`, minute: get("hour") * 60 + get("minute") };
};
const elapsedMinutes = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 60_000;

export function interpretInterval(reading: StateReading, profile: MachineProfile, jobs: StateJob[], signals: StateSignal[], events: StateEvent[], plantActive = false) {
  const at = reading.timestamp;
  const local = localParts(at);
  const inShift = profile.shiftWindows.some((shift) => local.minute >= shift.startMinute && local.minute < shift.endMinute);
  const job = jobs.find((item) => overlaps(at, item.actualStart, item.actualEnd));
  const nextJob = jobs.find((item) => item.actualStart > at && elapsedMinutes(item.actualStart, at) <= 15);
  const signal = signals.find((item) => overlaps(at, item.startAt, item.endAt));
  const sampleEnd = new Date(at.getTime() + profile.intervalMinutes * 60_000);
  const matchedEvents = events.filter((item) => at < item.endAt && sampleEnd > item.startAt);
  const event = matchedEvents.find((item) => item.source === "DEMO_ENTRY") ?? matchedEvents[0];
  const evidence = [`Power ${round(reading.powerKw, 1)} kW at ${at.toISOString()} (${profile.intervalMinutes}-minute simulated sample).`];
  if (job) evidence.push(`Production job ${job.id} is active.`);
  else evidence.push("No active machine job at this sample.");
  if (signal) evidence.push(`${signal.source} state signal: ${signal.state}.`);
  if (reading.simulatedState === "FAULT" || reading.simulatedState === "STARTUP") evidence.push(`Simulator state context: ${reading.simulatedState}; this is not a measured PLC signal.`);
  if (event) evidence.push(`${event.source} operator context: ${event.reasonCode}${event.note ? ` — ${event.note}` : ""}.`);
  let state: MachineState;
  if (signal?.state === "FAULT" || ["FAULT", "MACHINE_FAULT"].includes(event?.reasonCode ?? "") || reading.simulatedState === "FAULT") state = "FAULT";
  else if (reading.powerKw < profile.offBelowKw) state = "OFF";
  else if (signal?.state === "SETUP" || reading.simulatedState === "STARTUP" || (event?.reasonCode === "TOOL_SETUP" && profile.setupKw && inRange(reading.powerKw, profile.setupKw)) || (nextJob && profile.setupKw && inRange(reading.powerKw, profile.setupKw))) state = "SETUP";
  else if ((job || plantActive || profile.productiveWithoutJob || signal?.state === "PRODUCTIVE") && inRange(reading.powerKw, profile.productiveKw)) state = "PRODUCTIVE";
  else if (inRange(reading.powerKw, profile.idleKw)) state = inShift ? "IDLE" : "STANDBY";
  else if (job && reading.powerKw >= profile.productiveKw[0] * 0.85) state = "PRODUCTIVE";
  else state = inShift ? "IDLE" : "STANDBY";
  if (profile.productiveWithoutJob && state === "PRODUCTIVE" && !plantActive && !job) evidence.push("Loaded utility power indicates machine operation; useful demand is unverified without a flow or process sensor.");
  if (signal && signal.state !== state && !(signal.state === "STARTUP" && state === "SETUP")) evidence.push(`Signal/power disagreement: interpreted ${state}; review signal mapping.`);
  if (state === "IDLE" || state === "STANDBY") evidence.push("Energized without confirmed productive operation; avoidability needs context and baseline comparison.");
  return { at: at.toISOString(), powerKw: reading.powerKw, state, idleClass: null as IdleClass | null, reasonCode: null as string | null, evidence, activeJobId: job?.id ?? null, signalSource: signal?.source ?? null, operatorEventSource: event?.source ?? null, recommendation: null as string | null, withoutOperatorContextReason: null as string | null, event, inShift };
}

export function diagnoseMachine(input: { profile: MachineProfile; readings: StateReading[]; jobs: StateJob[]; signals?: StateSignal[]; events?: StateEvent[]; plantJobs?: StateJob[]; outputJobs?: StateJob[]; baselineDays: number; recentDays?: number }): MachineDiagnosis {
  const { profile } = input;
  const signals = input.signals ?? [];
  const events = input.events ?? [];
  const plantJobs = input.plantJobs ?? [];
  const outputJobs = input.outputJobs ?? [];
  const sortedJobs = [...input.jobs].sort((a, b) => a.actualStart.getTime() - b.actualStart.getTime());
  const grouped = new Map<string, ReturnType<typeof interpretInterval>[]>();
  const plantWindows = plantJobs.map((job) => ({ startAt: job.actualStart, endAt: job.actualEnd })).sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).reduce<Array<{ startAt: Date; endAt: Date }>>((merged, window) => {
    const previous = merged.at(-1);
    if (previous && window.startAt <= previous.endAt) previous.endAt = new Date(Math.max(previous.endAt.getTime(), window.endAt.getTime()));
    else merged.push({ ...window });
    return merged;
  }, []);
  let plantWindowIndex = 0;
  for (const reading of [...input.readings].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
    const day = localParts(reading.timestamp).day;
    while (plantWindowIndex < plantWindows.length && plantWindows[plantWindowIndex].endAt <= reading.timestamp) plantWindowIndex++;
    const plantWindow = plantWindows[plantWindowIndex];
    const activePlantJob = Boolean(plantWindow && overlaps(reading.timestamp, plantWindow.startAt, plantWindow.endAt));
    const interpreted = interpretInterval(reading, profile, sortedJobs, signals, events, activePlantJob);
    const group = grouped.get(day) ?? [];
    group.push(interpreted); grouped.set(day, group);
  }
  const dayEntries = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  const baselineEntries = dayEntries.slice(0, input.baselineDays);
  const baselineIdleMinutes = median(baselineEntries.map(([, intervals]) => intervals.filter((item) => item.state === "IDLE" || item.state === "STANDBY").length * profile.intervalMinutes)) ?? 0;
  const baselineGaps: number[] = [];
  for (const day of baselineEntries.map(([value]) => value)) {
    const dayJobs = sortedJobs.filter((job) => localParts(job.actualStart).day === day);
    for (let i = 1; i < dayJobs.length; i++) if (dayJobs[i - 1].shift === dayJobs[i].shift) baselineGaps.push(Math.max(0, elapsedMinutes(dayJobs[i].actualStart, dayJobs[i - 1].actualEnd)));
  }
  const baselineGapMinutes = median(baselineGaps) ?? 30;
  const baselineOutput = median(baselineEntries.map(([day]) => (sortedJobs.length ? sortedJobs : outputJobs).filter((job) => localParts(job.actualEnd).day === day).reduce((sum, job) => sum + job.goodUnits, 0))) ?? 0;
  const days: MachineDay[] = dayEntries.map(([day, intervals]) => {
    const idle = intervals.filter((item) => item.state === "IDLE" || item.state === "STANDBY");
    const idleMinutes = idle.length * profile.intervalMinutes;
    const idleEnergy = idle.reduce((sum, item) => sum + item.powerKw * profile.intervalMinutes / 60, 0);
    const avgIdlePower = idleMinutes ? idleEnergy / (idleMinutes / 60) : 0;
    const excessMinutes = Math.max(0, idleMinutes - baselineIdleMinutes);
    const dayJobs = sortedJobs.filter((job) => localParts(job.actualStart).day === day);
    const candidates: Array<{ item: typeof intervals[number]; priority: number; reasonCode: string; evidence: string }> = [];
    let necessaryMinutes = 0;
    for (const item of idle) {
      const at = new Date(item.at);
      const inLongGap = dayJobs.some((job, index) => index < dayJobs.length - 1 && job.shift === dayJobs[index + 1].shift &&
        elapsedMinutes(dayJobs[index + 1].actualStart, job.actualEnd) > baselineGapMinutes + 15 &&
        at >= new Date(job.actualEnd.getTime() + 10 * 60_000) && at < new Date(dayJobs[index + 1].actualStart.getTime() - 10 * 60_000));
      item.withoutOperatorContextReason = !item.inShift && item.powerKw >= profile.idleKw[0] ? "LEFT_ENERGIZED_AFTER_SHIFT" : inLongGap ? "JOB_SCHEDULING_GAP" : "INSUFFICIENT_CONTEXT";
      if (item.event && necessaryCodes.has(item.event.reasonCode)) {
        item.idleClass = "Necessary"; item.reasonCode = item.event.reasonCode;
        item.evidence.push("Necessary idle is supported by a time-aligned operator event.");
        necessaryMinutes += profile.intervalMinutes;
        continue;
      }
      if (item.event && avoidableCodes.has(item.event.reasonCode)) {
        candidates.push({ item, priority: 0, reasonCode: item.event.reasonCode, evidence: "Time-aligned operator event identifies a possible avoidable cause." });
        continue;
      }
      if (!item.inShift && item.powerKw >= profile.idleKw[0]) {
        candidates.push({ item, priority: 1, reasonCode: "LEFT_ENERGIZED_AFTER_SHIFT", evidence: "Machine remained energized outside both configured production shifts." });
        continue;
      }
      if (inLongGap) candidates.push({ item, priority: 2, reasonCode: "JOB_SCHEDULING_GAP", evidence: `Between-job gap exceeds the healthy median of ${round(baselineGapMinutes)} minutes by more than 15 minutes.` });
      else { item.idleClass = "Unexplained"; item.reasonCode = "INSUFFICIENT_CONTEXT"; item.evidence.push("No time-aligned necessary or avoidable event; requires operator review."); }
    }
    let budget = Math.floor(excessMinutes / profile.intervalMinutes);
    let betweenJobsMinutes = 0;
    for (const candidate of candidates.sort((a, b) => a.priority - b.priority || a.item.at.localeCompare(b.item.at))) {
      if (budget > 0) {
        candidate.item.idleClass = "Potentially Avoidable"; candidate.item.reasonCode = candidate.reasonCode;
        candidate.item.evidence.push(candidate.evidence, `Counted within ${round(excessMinutes)} excess idle minutes above the healthy daily baseline.`);
        if (candidate.reasonCode === "JOB_SCHEDULING_GAP" || candidate.reasonCode === "WAITING_FOR_MATERIAL") betweenJobsMinutes += profile.intervalMinutes;
        budget--;
      } else {
        candidate.item.idleClass = "Unexplained"; candidate.item.reasonCode = "WITHIN_HEALTHY_IDLE_ALLOWANCE";
        candidate.item.evidence.push("Possible cause exists, but this interval is within the healthy daily idle allowance; not counted as avoidable energy.");
      }
    }
    for (const item of idle) {
      item.recommendation = recommendationForReason(item.reasonCode);
      item.evidence.push(`Recommended follow-up: ${item.recommendation}`);
    }
    const avoidableMinutes = idle.filter((item) => item.idleClass === "Potentially Avoidable").length * profile.intervalMinutes;
    const unexplainedMinutes = idleMinutes - necessaryMinutes - avoidableMinutes;
    const stateMinutes = { OFF: 0, SETUP: 0, PRODUCTIVE: 0, IDLE: 0, STANDBY: 0, FAULT: 0 };
    for (const item of intervals) stateMinutes[item.state] += profile.intervalMinutes;
    const dayOutput = (sortedJobs.length ? dayJobs : outputJobs.filter((job) => localParts(job.actualEnd).day === day)).reduce((sum, job) => sum + job.goodUnits, 0);
    const avoidableEnergy = avgIdlePower * avoidableMinutes / 60;
    return {
      day, idleHours: round(idleMinutes / 60), baselineIdleHours: round(baselineIdleMinutes / 60), excessIdleHours: round(excessMinutes / 60),
      averageIdlePowerKw: round(avgIdlePower), idleEnergyKwh: round(avgIdlePower * idleMinutes / 60),
      necessaryIdleHours: round(necessaryMinutes / 60), potentiallyAvoidableHours: round(avoidableMinutes / 60), unexplainedIdleHours: round(unexplainedMinutes / 60),
      avoidableIdleEnergyKwh: round(avoidableEnergy), costImpactInr: round(avoidableEnergy * profile.tariffInrPerKwh),
      goodOutput: dayOutput, jobCount: dayJobs.length, betweenJobsSharePercent: avoidableMinutes ? round(betweenJobsMinutes / avoidableMinutes * 100) : 0,
      stateMinutes, intervals: intervals.map(({ event: _event, inShift: _inShift, ...rest }) => rest)
    };
  });
  const recent = days.slice(-(input.recentDays ?? 7));
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const averageIdleHours = mean(recent.map((day) => day.idleHours));
  const averageAvoidableHours = mean(recent.map((day) => day.potentiallyAvoidableHours));
  const avgPower = mean(recent.map((day) => day.averageIdlePowerKw));
  const avgAvoidableEnergy = mean(recent.map((day) => day.avoidableIdleEnergyKwh));
  const recentOutput = mean(recent.map((day) => day.goodOutput));
  const outputChangePercent = baselineOutput > 0 ? (recentOutput - baselineOutput) / baselineOutput * 100 : null;
  const totalAvoidable = recent.reduce((sum, day) => sum + day.potentiallyAvoidableHours, 0);
  const betweenJobsShare = totalAvoidable ? recent.reduce((sum, day) => sum + day.betweenJobsSharePercent * day.potentiallyAvoidableHours, 0) / totalAvoidable : 0;
  const totalIdle = recent.reduce((sum, day) => sum + day.idleHours, 0);
  const necessaryShare = totalIdle ? recent.reduce((sum, day) => sum + day.necessaryIdleHours, 0) / totalIdle * 100 : 0;
  const totalSamples = recent.reduce((sum, day) => sum + day.intervals.length, 0);
  const signalCoverage = totalSamples ? recent.reduce((sum, day) => sum + day.intervals.filter((item) => item.signalSource).length, 0) / totalSamples * 100 : 0;
  const eventCount = events.filter((event) => recent.length && localParts(event.startAt).day >= recent[0].day).length;
  const excessive = averageIdleHours > baselineIdleMinutes / 60 + 0.5;
  const status = !excessive ? "Within Baseline" : averageAvoidableHours >= 0.5 && (outputChangePercent === null || outputChangePercent >= -10) ? "Potential Opportunity" : "Needs Context";
  const monthlyEnergy = avgAvoidableEnergy * profile.productionDaysPerMonth;
  const monthlyCost = monthlyEnergy * profile.tariffInrPerKwh;
  const confidence = Math.min(0.95, Math.max(0.35, 0.5 + Math.min(0.2, input.baselineDays / 70) + (profile.meteringBasis === "DIRECT_METER" ? 0.15 : 0) + (eventCount ? 0.07 : 0) + (signalCoverage ? 0.03 : 0)));
  const causeMinutes = new Map<string, number>();
  for (const day of recent) for (const interval of day.intervals) if (interval.idleClass === "Potentially Avoidable" && interval.reasonCode) causeMinutes.set(interval.reasonCode, (causeMinutes.get(interval.reasonCode) ?? 0) + profile.intervalMinutes);
  const primaryReason = [...causeMinutes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const recommendation = recommendationForReason(primaryReason);
  const evidence = [
    `Recent ${recent.length}-day idle runtime averages ${round(averageIdleHours)} h/day; healthy ${input.baselineDays}-day median is ${round(baselineIdleMinutes / 60)} h/day.`,
    `Excess idle averages ${round(Math.max(0, averageIdleHours - baselineIdleMinutes / 60))} h/day at ${round(avgPower)} kW average idle power.`,
    `Useful output is ${outputChangePercent === null ? "not available for comparison" : `${round(outputChangePercent, 1)}% versus the healthy median`}.`,
    `${round(betweenJobsShare, 1)}% of candidate avoidable idle is between jobs or material waits; ${round(necessaryShare, 1)}% of all idle is supported as necessary.`,
    `${eventCount} operator events and ${round(signalCoverage, 1)}% signal coverage in the recent window; measurement basis: ${profile.meteringBasis}.`,
    "Potentially avoidable intervals are capped by excess idle above the healthy baseline. Necessary and unexplained time is excluded from the impact estimate."
  ];
  if (status === "Needs Context") evidence.push("Idle is elevated, but output change or missing cause evidence prevents an opportunity claim.");
  if (status === "Potential Opportunity") evidence.push("The estimate is an opportunity for engineering review, not verified savings.");
  return {
    code: profile.code, status, title: status === "Potential Opportunity" ? `${profile.code} excess idle opportunity` : `${profile.code} idle state review`,
    baselineIdleHours: round(baselineIdleMinutes / 60), baselineGapMinutes: round(baselineGapMinutes),
    averageIdleHoursPerDay: round(averageIdleHours), excessIdleHoursPerDay: round(Math.max(0, averageIdleHours - baselineIdleMinutes / 60)),
    averageIdlePowerKw: round(avgPower), idleEnergyKwhPerDay: round(mean(recent.map((day) => day.idleEnergyKwh))),
    avoidableIdleHoursPerDay: round(averageAvoidableHours), avoidableIdleEnergyKwhPerDay: round(avgAvoidableEnergy),
    dailyCostImpactInr: round(avgAvoidableEnergy * profile.tariffInrPerKwh), monthlyEnergyKwh: round(monthlyEnergy), monthlyImpactInr: round(monthlyCost),
    annualEnergyKwh: round(monthlyEnergy * 12), annualImpactInr: round(monthlyCost * 12), outputChangePercent: outputChangePercent === null ? null : round(outputChangePercent, 1),
    betweenJobsSharePercent: round(betweenJobsShare, 1), necessarySharePercent: round(necessaryShare, 1), signalCoveragePercent: round(signalCoverage, 1),
    operatorEventCount: eventCount, confidence: round(confidence, 2), evidence, recommendation, days, source: "SIMULATED"
  };
}
