import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyMaterialStaging, type VerificationInput } from "./calculation";

const start = Date.parse("2026-01-01T00:00:00.000Z");
const oneDay = 86_400_000;
const minute = 60_000;
const readings = Array.from({ length: 7 }, (_, day) => [
  { timestamp: new Date(start + day * oneDay).toISOString(), powerKw: 30, energyKwh: 2.5, state: "PRODUCTIVE" },
  { timestamp: new Date(start + day * oneDay + 5 * minute).toISOString(), powerKw: 10, energyKwh: 10 / 12, state: "IDLE" },
  { timestamp: new Date(start + day * oneDay + 10 * minute).toISOString(), powerKw: 10, energyKwh: 10 / 12, state: "IDLE" }
]).flat();
const jobs = Array.from({ length: 7 }, (_, day) => ({ id: `J-${day}`, actualStart: new Date(start + day * oneDay).toISOString(), quantity: 100, goodUnits: 98, rejectedUnits: 2 }));
const input: VerificationInput = {
  beforeStartAt: new Date(start).toISOString(), intervalMinutes: 5, readings, jobs,
  candidateIntervals: readings.filter((row) => row.state === "IDLE").map((row) => ({ at: row.timestamp, idleClass: "Potentially Avoidable", reasonCode: "MATERIAL_UNAVAILABLE" })),
  targetIdleReduction: .5, predictedReductionLow: .35, predictedReductionHigh: .55,
  diagnosticConfidence: .95, diagnosedAvoidableIdleKwhPerDay: 10 / 6,
  tariffInrPerKwh: 9, productionDaysPerYear: 312, capexInr: 0, operatorEventCount: 3
};

test("adjusted baseline verifies a saving at unchanged good-job output", () => {
  const result = verifyMaterialStaging(input);
  assert.equal(result.before.usefulOutput, 7);
  assert.equal(result.after.usefulOutput, 7);
  assert.equal(result.adjustedBaselineEnergyKwh, result.before.energyKwh);
  assert.ok(Math.abs(result.verifiedKwh! - (result.adjustedBaselineEnergyKwh! - result.after.energyKwh)) < .02);
  assert.ok(Math.abs(result.secImprovementPercent! - (result.before.secKwhPerGoodJob! - result.after.secKwhPerGoodJob!) / result.before.secKwhPerGoodJob! * 100) < .1);
  assert.equal(result.productionPreserved, true);
  assert.equal(result.qualityPreserved, true);
  assert.equal(result.status, "VERIFIED");
});

test("zero intervention cannot become a verified saving", () => {
  const result = verifyMaterialStaging({ ...input, targetIdleReduction: 0 });
  assert.equal(result.shortenedIdleSamples, 0);
  assert.equal(result.verifiedKwh, 0);
  assert.equal(result.before.idleHoursPerDay, result.after.idleHoursPerDay);
  assert.equal(result.status, "REVIEW");
});

test("prediction comes from diagnosed idle baseline while annual verified value comes from observed after period", () => {
  const result = verifyMaterialStaging(input);
  assert.equal(result.predicted.savingLowKwhPerYear, Number((input.diagnosedAvoidableIdleKwhPerDay * 312 * .35).toFixed(2)));
  assert.equal(result.predicted.savingHighKwhPerYear, Number((input.diagnosedAvoidableIdleKwhPerDay * 312 * .55).toFixed(2)));
  assert.ok(Math.abs(result.annualVerifiedKwh! - result.verifiedKwh! / 7 * 312) < .25);
  assert.ok(Math.abs(result.annualVerifiedRupees! - result.annualVerifiedKwh! * 9) < 1);
});
