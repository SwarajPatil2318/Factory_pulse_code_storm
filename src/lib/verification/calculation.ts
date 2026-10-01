export type VerificationReading = { timestamp: string; powerKw: number; energyKwh: number; state: string };
export type VerificationJob = { id: string; actualStart: string; quantity: number; goodUnits: number; rejectedUnits: number };
export type CandidateIdleInterval = { at: string; idleClass: string | null; reasonCode: string | null };

export type VerificationInput = {
  beforeStartAt: string;
  intervalMinutes: number;
  readings: VerificationReading[];
  jobs: VerificationJob[];
  candidateIntervals: CandidateIdleInterval[];
  targetIdleReduction: number;
  predictedReductionLow: number;
  predictedReductionHigh: number;
  diagnosticConfidence: number;
  diagnosedAvoidableIdleKwhPerDay: number;
  tariffInrPerKwh: number;
  productionDaysPerYear: number;
  capexInr: number;
  operatorEventCount: number;
};

const dayMs = 86_400_000;
const round = (value: number, digits = 2) => Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(digits));
const materialReasons = new Set(["MATERIAL_WAIT", "MATERIAL_UNAVAILABLE", "WAITING_FOR_MATERIAL", "JOB_SCHEDULING_GAP"]);
const idleStates = new Set(["IDLE", "STANDBY"]);

/** In-memory, deterministic after period. No generated values are persisted or represented as measured. */
export function verifyMaterialStaging(input: VerificationInput) {
  const start = new Date(input.beforeStartAt).getTime();
  const days = 7;
  const ratio = Math.min(1, Math.max(0, input.targetIdleReduction));
  const eligible = input.candidateIntervals.filter((item) => item.idleClass === "Potentially Avoidable" && materialReasons.has(item.reasonCode ?? ""))
    .map((item) => item.at).sort();
  // Evenly choose a fraction of diagnosed between-job samples; selection uses timestamps, not final savings.
  const shortened = new Set(eligible.filter((_, index) => Math.floor((index + 1) * ratio) > Math.floor(index * ratio)));
  const daily = Array.from({ length: days }, (_, index) => ({
    index, label: `Day ${index + 1}`, beforeDay: new Date(start + index * dayMs).toISOString(), afterDay: new Date(start + (index + days) * dayMs).toISOString(),
    beforeEnergyKwh: 0, afterEnergyKwh: 0, beforeIdleHours: 0, afterIdleHours: 0, beforeGoodJobs: 0, afterGoodJobs: 0,
    beforeQuantity: 0, afterQuantity: 0, beforeRejected: 0, afterRejected: 0
  }));
  const afterReadings = input.readings.map((reading) => {
    const improved = shortened.has(reading.timestamp) && idleStates.has(reading.state);
    return {
      ...reading,
      timestamp: new Date(new Date(reading.timestamp).getTime() + days * dayMs).toISOString(),
      powerKw: improved ? .2 : reading.powerKw,
      energyKwh: improved ? .2 * input.intervalMinutes / 60 : reading.energyKwh,
      state: improved ? "OFF" : reading.state
    };
  });
  for (let index = 0; index < input.readings.length; index++) {
    const before = input.readings[index];
    const after = afterReadings[index];
    const dayIndex = Math.floor((new Date(before.timestamp).getTime() - start) / dayMs);
    const row = daily[dayIndex];
    if (!row) continue;
    row.beforeEnergyKwh += before.energyKwh;
    row.afterEnergyKwh += after.energyKwh;
    if (idleStates.has(before.state)) row.beforeIdleHours += input.intervalMinutes / 60;
    if (idleStates.has(after.state)) row.afterIdleHours += input.intervalMinutes / 60;
  }
  const afterJobs = input.jobs.map((job) => ({ ...job, actualStart: new Date(new Date(job.actualStart).getTime() + days * dayMs).toISOString() }));
  for (let index = 0; index < input.jobs.length; index++) {
    const before = input.jobs[index];
    const after = afterJobs[index];
    const dayIndex = Math.floor((new Date(before.actualStart).getTime() - start) / dayMs);
    const row = daily[dayIndex];
    if (!row) continue;
    row.beforeGoodJobs += Number(before.goodUnits > 0);
    row.afterGoodJobs += Number(after.goodUnits > 0);
    row.beforeQuantity += before.quantity;
    row.afterQuantity += after.quantity;
    row.beforeRejected += before.rejectedUnits;
    row.afterRejected += after.rejectedUnits;
  }
  const sum = (key: keyof typeof daily[number]) => daily.reduce((total, row) => total + Number(row[key]), 0);
  const energyBefore = sum("beforeEnergyKwh");
  const energyAfter = sum("afterEnergyKwh");
  const outputBefore = sum("beforeGoodJobs");
  const outputAfter = sum("afterGoodJobs");
  const secBefore = outputBefore > 0 ? energyBefore / outputBefore : null;
  const secAfter = outputAfter > 0 ? energyAfter / outputAfter : null;
  const adjustedBaselineEnergyKwh = secBefore === null ? null : secBefore * outputAfter;
  const verifiedKwh = adjustedBaselineEnergyKwh === null ? null : adjustedBaselineEnergyKwh - energyAfter;
  const verifiedPercent = adjustedBaselineEnergyKwh && verifiedKwh !== null ? verifiedKwh / adjustedBaselineEnergyKwh * 100 : null;
  const secImprovementPercent = secBefore && secAfter !== null ? (secBefore - secAfter) / secBefore * 100 : null;
  const beforeRejectRate = sum("beforeQuantity") > 0 ? sum("beforeRejected") / sum("beforeQuantity") : null;
  const afterRejectRate = sum("afterQuantity") > 0 ? sum("afterRejected") / sum("afterQuantity") : null;
  const productionPreserved = outputAfter >= outputBefore && outputBefore > 0;
  const qualityPreserved = beforeRejectRate !== null && afterRejectRate !== null && afterRejectRate <= beforeRejectRate;
  const predictedDailyCandidateKwh = Math.max(0, input.diagnosedAvoidableIdleKwhPerDay);
  const predictedLowKwhPerYear = predictedDailyCandidateKwh * input.productionDaysPerYear * input.predictedReductionLow;
  const predictedHighKwhPerYear = predictedDailyCandidateKwh * input.productionDaysPerYear * input.predictedReductionHigh;
  const predictedMidKwhPerYear = (predictedLowKwhPerYear + predictedHighKwhPerYear) / 2;
  const annualBeforeKwh = energyBefore / days * input.productionDaysPerYear;
  const annualVerifiedKwh = verifiedKwh === null ? null : verifiedKwh / days * input.productionDaysPerYear;
  const status = verifiedKwh !== null && verifiedKwh > 0 && productionPreserved && qualityPreserved && sum("afterIdleHours") < sum("beforeIdleHours") ? "VERIFIED" : "REVIEW";
  return {
    source: "SIMULATED" as const, status, intervention: "Improve material staging before LC-01 jobs",
    beforePeriod: { startAt: daily[0].beforeDay, endAt: new Date(start + days * dayMs).toISOString() },
    afterPeriod: { startAt: daily[0].afterDay, endAt: new Date(start + days * 2 * dayMs).toISOString() },
    generatedAfterSamples: afterReadings.length, generatedAfterJobs: afterJobs.length,
    shortenedIdleSamples: shortened.size, eligibleIdleSamples: eligible.length,
    before: { energyKwh: round(energyBefore), usefulOutput: outputBefore, secKwhPerGoodJob: secBefore === null ? null : round(secBefore), idleHoursPerDay: round(sum("beforeIdleHours") / days), rejectionRate: beforeRejectRate === null ? null : round(beforeRejectRate, 4) },
    after: { energyKwh: round(energyAfter), usefulOutput: outputAfter, secKwhPerGoodJob: secAfter === null ? null : round(secAfter), idleHoursPerDay: round(sum("afterIdleHours") / days), rejectionRate: afterRejectRate === null ? null : round(afterRejectRate, 4) },
    secImprovementPercent: secImprovementPercent === null ? null : round(secImprovementPercent, 1),
    adjustedBaselineEnergyKwh: adjustedBaselineEnergyKwh === null ? null : round(adjustedBaselineEnergyKwh),
    verifiedKwh: verifiedKwh === null ? null : round(verifiedKwh),
    verifiedRupees: verifiedKwh === null ? null : round(verifiedKwh * input.tariffInrPerKwh, 0),
    verifiedPercent: verifiedPercent === null ? null : round(verifiedPercent, 1),
    annualVerifiedKwh: annualVerifiedKwh === null ? null : round(annualVerifiedKwh),
    annualVerifiedRupees: annualVerifiedKwh === null ? null : round(annualVerifiedKwh * input.tariffInrPerKwh, 0),
    predicted: {
      idleReductionLowPercent: round(input.predictedReductionLow * 100, 0), idleReductionHighPercent: round(input.predictedReductionHigh * 100, 0),
      savingLowKwhPerYear: round(predictedLowKwhPerYear), savingHighKwhPerYear: round(predictedHighKwhPerYear), savingMidKwhPerYear: round(predictedMidKwhPerYear),
      machineEnergyLowPercent: annualBeforeKwh > 0 ? round(predictedLowKwhPerYear / annualBeforeKwh * 100, 1) : 0,
      machineEnergyHighPercent: annualBeforeKwh > 0 ? round(predictedHighKwhPerYear / annualBeforeKwh * 100, 1) : 0
    },
    productionPreserved, qualityPreserved,
    passport: { title: "LC-01 Material Staging Improvement", problem: "Excess avoidable idle between scheduled jobs", evidence: ["Direct LC-01 power readings", "Production job timestamps and output", input.operatorEventCount > 0 ? `${input.operatorEventCount} operator context events` : "No operator event available"], recommendation: "Pre-stage material before the current job finishes.", capexInr: input.capexInr, confidence: input.diagnosticConfidence, implementation: "Completed in simulated after period", status },
    daily: daily.map((row) => ({ label: row.label, beforeEnergyKwh: round(row.beforeEnergyKwh), afterEnergyKwh: round(row.afterEnergyKwh), beforeIdleHours: round(row.beforeIdleHours), afterIdleHours: round(row.afterIdleHours), beforeGoodJobs: row.beforeGoodJobs, afterGoodJobs: row.afterGoodJobs }))
  };
}
