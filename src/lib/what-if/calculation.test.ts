import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateWhatIf, defaultWhatIfInputs } from "./calculation";
import type { WhatIfBaseline } from "./model";

const base: WhatIfBaseline = {
  source: "SIMULATED", recentDays: 7, productionDaysPerYear: 312, tariffInrPerKwh: 9,
  lc: { dailyEnergyKwh: 342.1, dailyProductiveEnergyKwh: 259.838, dailyIdleEnergyKwh: 53.691, dailyOtherEnergyKwh: 28.571, productiveHoursPerDay: 9.143, idleHoursPerDay: 5.524, avoidableIdleHoursPerDay: 2.11, avoidableIdleEnergyKwhPerDay: 20.76, idlePowerKw: 9.86, jobsPerDay: 6, jobsPerProductiveHour: .656 },
  ac: { dailyEnergyKwh: 778.475, unloadHoursPerDay: 13.333, unloadPowerKw: 18.941, avoidableUnloadHoursPerDay: 8.07, avoidableUnloadEnergyKwhPerDay: 152.88 },
  pc: { dailyEnergyKwh: 535.17, componentsPerDay: 194.571, batchesPerDay: 6, currentComponentsPerBatch: 32.429, referenceCapacityComponents: 82, currentUtilisationPercent: 39.547, fixedEnergyPerBatchKwh: 48.521, variableEnergyPerComponentKwh: 1.254 }
};

test("zero idle reduction leaves machine SEC and annual energy unchanged", () => {
  const result = calculateWhatIf(base, { ...defaultWhatIfInputs(base), idleReductionPercent: 0 });
  assert.equal(result.optionA.annualEnergySavingKwh, 0);
  assert.equal(result.optionA.annualEnergyKwh, result.current.annualEnergyKwh);
  assert.equal(result.idle.hoursPerDay, Number(base.lc.idleHoursPerDay.toFixed(2)));
  assert.equal(result.idle.secImprovementPercent, 0);
});

test("maximum idle reduction removes only candidate idle, never all idle", () => {
  const result = calculateWhatIf(base, { ...defaultWhatIfInputs(base), idleReductionPercent: 100 });
  assert.equal(result.optionA.annualEnergySavingKwh, Number((base.lc.avoidableIdleEnergyKwhPerDay * 312).toFixed(1)));
  assert.ok(result.idle.hoursPerDay > 0);
  assert.equal(result.optionA.annualEnergySavingInr, Math.round(result.optionA.annualEnergySavingKwh * 9));
});

test("replacement includes maintenance in payback but recommendation compares energy only", () => {
  const inputs = defaultWhatIfInputs(base);
  const result = calculateWhatIf(base, inputs);
  assert.equal(result.optionC!.annualTotalSavingInr, result.optionC!.annualEnergySavingInr + inputs.replacementMaintenanceSavingInrPerYear);
  assert.equal(result.recommendation.operationalName, "Option B · auto-standby");
  assert.equal(result.recommendation.optimizeFirst, true);
  assert.ok(result.recommendation.capturedPercent! > 50);
  assert.ok(result.recommendation.capexPercent! < 10);
  const expensive = calculateWhatIf(base, { ...inputs, standbyCapexInr: inputs.replacementCapexInr * .2 });
  assert.equal(expensive.recommendation.operationalName, "Option A · idle optimization");
});

test("coating holds good components constant and larger effective batches reduce fixed energy", () => {
  const input = defaultWhatIfInputs(base);
  const small = calculateWhatIf(base, { ...input, coatingUtilisationPercent: 50, coatingComponentsPerBatch: 30 });
  const large = calculateWhatIf(base, { ...input, coatingUtilisationPercent: 80, coatingComponentsPerBatch: 60 });
  assert.equal(small.coatingDetail.annualComponents, large.coatingDetail.annualComponents);
  assert.ok(large.coatingDetail.batchesPerYear < small.coatingDetail.batchesPerYear);
  assert.ok(large.coating.annualEnergyKwh < small.coating.annualEnergyKwh);
});

test("replacement cannot count existing idle hours as productive capacity while retaining idle energy", () => {
  const result = calculateWhatIf(base, { ...defaultWhatIfInputs(base), replacementJobsPerHour: 0.5 });
  assert.equal(result.replacement.meetsOutput, false);
  assert.equal(result.replacement.throughputCapacityJobsPerYear, Number((0.5 * base.lc.productiveHoursPerDay * 312).toFixed(1)));
  assert.ok(result.replacement.throughputCapacityJobsPerYear < result.current.annualJobs);
});
