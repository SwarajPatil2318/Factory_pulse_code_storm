import type { ScenarioResult, WhatIfBaseline, WhatIfInputs } from "./model";

const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const percent = (value: number) => Math.min(100, Math.max(0, value)) / 100;
const nonnegative = (value: number) => Math.max(0, value);

export function defaultWhatIfInputs(base: WhatIfBaseline): WhatIfInputs {
  return {
    idleReductionPercent: 50,
    standbyCapexInr: 35000,
    standbyPowerKw: 3,
    standbyIdleDurationReductionPercent: 60,
    replacementCapexInr: 2800000,
    replacementProductiveKw: 27,
    replacementIdleKw: 8,
    replacementJobsPerHour: round(base.lc.jobsPerProductiveHour * 1.03, 2),
    replacementMaintenanceSavingInrPerYear: 25000,
    compressorUnloadReductionPercent: 35,
    compressorNewUnloadPowerKw: 14,
    compressorVfdCapexInr: 280000,
    coatingUtilisationPercent: Math.min(100, Math.max(20, Math.round(base.pc.currentUtilisationPercent + 20))),
    coatingComponentsPerBatch: Math.max(1, Math.round(base.pc.currentComponentsPerBatch * 1.3))
  };
}

function result(currentAnnualKwh: number, proposedAnnualKwh: number, tariff: number, capexInr: number, maintenanceSavingInrPerYear = 0): ScenarioResult {
  const annualEnergySavingKwh = round(currentAnnualKwh - proposedAnnualKwh);
  const annualEnergySavingInr = round(annualEnergySavingKwh * tariff, 0);
  const annualTotalSavingInr = round(annualEnergySavingInr + maintenanceSavingInrPerYear, 0);
  return {
    annualEnergyKwh: round(proposedAnnualKwh), annualEnergyCostInr: round(proposedAnnualKwh * tariff, 0),
    annualEnergySavingKwh, annualEnergySavingInr, annualTotalSavingInr, capexInr,
    paybackMonths: capexInr === 0 && annualTotalSavingInr > 0 ? 0 : annualTotalSavingInr > 0 ? round(capexInr / annualTotalSavingInr * 12) : null,
    fiveYearNetBenefitInr: round(5 * annualTotalSavingInr - capexInr, 0)
  };
}

export function calculateWhatIf(base: WhatIfBaseline, input: WhatIfInputs) {
  const days = base.productionDaysPerYear;
  const tariff = base.tariffInrPerKwh;
  const lcCurrentAnnualKwh = base.lc.dailyEnergyKwh * days;
  const annualJobs = base.lc.jobsPerDay * days;
  const lcCurrentCostInr = lcCurrentAnnualKwh * tariff;
  const currentKwhPerJob = annualJobs > 0 ? lcCurrentAnnualKwh / annualJobs : 0;

  // Only diagnosed potentially avoidable energy is removed; necessary idle and other machine states remain.
  const idleSavingPerDay = base.lc.avoidableIdleEnergyKwhPerDay * percent(input.idleReductionPercent);
  const optionA = result(lcCurrentAnnualKwh, nonnegative(lcCurrentAnnualKwh - idleSavingPerDay * days), tariff, 0);
  const idleHoursPerDay = nonnegative(base.lc.idleHoursPerDay - base.lc.avoidableIdleHoursPerDay * percent(input.idleReductionPercent));
  const idleKwhPerMonth = nonnegative((base.lc.dailyIdleEnergyKwh - idleSavingPerDay) * days / 12);
  const optionAKwhPerJob = annualJobs > 0 ? optionA.annualEnergyKwh / annualJobs : 0;
  const secImprovementPercent = currentKwhPerJob > 0 ? (1 - optionAKwhPerJob / currentKwhPerJob) * 100 : 0;

  // During the diagnosed avoidable window, fewer hours remain energized and those hours draw new standby power.
  const remainingStandbyHours = base.lc.avoidableIdleHoursPerDay * (1 - percent(input.standbyIdleDurationReductionPercent));
  const standbyProposedCandidateKwh = remainingStandbyHours * nonnegative(input.standbyPowerKw);
  const standbySavingPerDay = base.lc.avoidableIdleEnergyKwhPerDay - standbyProposedCandidateKwh;
  const optionB = result(lcCurrentAnnualKwh, nonnegative(lcCurrentAnnualKwh - standbySavingPerDay * days), tariff, nonnegative(input.standbyCapexInr));

  // Same annual job count. Faster throughput lowers required productive hours; existing idle and other loads stay.
  const proposedProductiveHoursPerDay = input.replacementJobsPerHour > 0 ? base.lc.jobsPerDay / input.replacementJobsPerHour : Infinity;
  const replacementMeetsOutput = Number.isFinite(proposedProductiveHoursPerDay) && proposedProductiveHoursPerDay <= base.lc.productiveHoursPerDay;
  const replacementDailyKwh = Number.isFinite(proposedProductiveHoursPerDay)
    ? proposedProductiveHoursPerDay * nonnegative(input.replacementProductiveKw) + base.lc.idleHoursPerDay * nonnegative(input.replacementIdleKw) + base.lc.dailyOtherEnergyKwh
    : Infinity;
  const optionC = Number.isFinite(replacementDailyKwh)
    ? result(lcCurrentAnnualKwh, replacementDailyKwh * days, tariff, nonnegative(input.replacementCapexInr), nonnegative(input.replacementMaintenanceSavingInrPerYear))
    : null;
  const replacementThroughputCapacityJobsPerYear = nonnegative(input.replacementJobsPerHour) * base.lc.productiveHoursPerDay * days;

  const acCurrentAnnualKwh = base.ac.dailyEnergyKwh * days;
  const acRemainingHours = base.ac.avoidableUnloadHoursPerDay * (1 - percent(input.compressorUnloadReductionPercent));
  const acProposedCandidateKwh = acRemainingHours * nonnegative(input.compressorNewUnloadPowerKw);
  const acSavingPerDay = base.ac.avoidableUnloadEnergyKwhPerDay - acProposedCandidateKwh;
  const compressor = result(acCurrentAnnualKwh, nonnegative(acCurrentAnnualKwh - acSavingPerDay * days), tariff, nonnegative(input.compressorVfdCapexInr));

  const pcAnnualComponents = base.pc.componentsPerDay * days;
  const pcCurrentAnnualKwh = base.pc.dailyEnergyKwh * days;
  const effectiveBatchSize = Math.max(1, Math.min(nonnegative(input.coatingComponentsPerBatch), base.pc.referenceCapacityComponents * percent(input.coatingUtilisationPercent)));
  const pcBatchesPerYear = pcAnnualComponents / effectiveBatchSize;
  const pcProposedAnnualKwh = base.pc.fixedEnergyPerBatchKwh * pcBatchesPerYear + base.pc.variableEnergyPerComponentKwh * pcAnnualComponents;
  const coating = result(pcCurrentAnnualKwh, pcProposedAnnualKwh, tariff, 0);

  const operational = [
    { name: "Option A · idle optimization", scenario: optionA },
    { name: "Option B · auto-standby", scenario: optionB }
  ].filter((item) => item.scenario.annualEnergySavingKwh > 0 && item.scenario.capexInr < nonnegative(input.replacementCapexInr) * .1)
    .sort((a, b) => b.scenario.annualEnergySavingKwh - a.scenario.annualEnergySavingKwh)[0];
  const replacementEnergySaving = optionC?.annualEnergySavingKwh ?? 0;
  const capturedPercent = operational && replacementEnergySaving > 0 ? operational.scenario.annualEnergySavingKwh / replacementEnergySaving * 100 : null;
  const capexPercent = operational && input.replacementCapexInr > 0 ? operational.scenario.capexInr / input.replacementCapexInr * 100 : null;
  const optimizeFirst = Boolean(operational && (!replacementMeetsOutput || replacementEnergySaving <= 0 || (capturedPercent !== null && capturedPercent > 50 && capexPercent !== null && capexPercent < 10)));

  return {
    current: { annualEnergyKwh: round(lcCurrentAnnualKwh), annualCostInr: round(lcCurrentCostInr, 0), annualJobs: round(annualJobs), kwhPerJob: round(currentKwhPerJob, 2), jobsPerHour: base.lc.jobsPerProductiveHour },
    optionA, idle: { hoursPerDay: round(idleHoursPerDay, 2), kwhPerMonth: round(idleKwhPerMonth), totalMachineKwhPerDay: round(optionA.annualEnergyKwh / days), kwhPerJob: round(optionAKwhPerJob, 2), secImprovementPercent: round(secImprovementPercent, 1) },
    optionB, standby: { candidateHoursPerDay: round(remainingStandbyHours, 2), currentPowerKw: base.lc.idlePowerKw },
    optionC, replacement: { productiveHoursPerDay: round(proposedProductiveHoursPerDay, 2), meetsOutput: replacementMeetsOutput, kwhPerJob: optionC && annualJobs > 0 ? round(optionC.annualEnergyKwh / annualJobs, 2) : null, throughputCapacityJobsPerYear: round(replacementThroughputCapacityJobsPerYear), maintenanceSavingInrPerYear: nonnegative(input.replacementMaintenanceSavingInrPerYear) },
    compressor, compressorDetail: { unloadHoursPerDay: round(acRemainingHours, 2), currentAnnualKwh: round(acCurrentAnnualKwh) },
    coating, coatingDetail: { effectiveComponentsPerBatch: round(effectiveBatchSize, 1), currentKwhPerComponent: pcAnnualComponents > 0 ? round(pcCurrentAnnualKwh / pcAnnualComponents, 2) : 0, proposedKwhPerComponent: pcAnnualComponents > 0 ? round(coating.annualEnergyKwh / pcAnnualComponents, 2) : 0, annualComponents: round(pcAnnualComponents), batchesPerYear: round(pcBatchesPerYear) },
    recommendation: { operationalName: operational?.name ?? null, capturedPercent: capturedPercent === null ? null : round(capturedPercent, 1), capexPercent: capexPercent === null ? null : round(capexPercent, 2), optimizeFirst, replacementMeetsOutput }
  };
}
