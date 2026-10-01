import assert from "node:assert/strict";
import { test } from "node:test";
import { assessMeasurement, rankMeasurements, type SenseCandidate } from "./calculation";

const pc: SenseCandidate = {
  equipmentId: "eq-pc01", code: "PC-01", name: "Powder Coating PC-01", parentCode: "PF-01",
  meteringMode: "FEEDER_METER", sharedFeederMachines: 6, recentJobCount: 42,
  recentOperatorEventCount: 0, healthyComparableCount: 14, repeatCount: 9,
  issueState: "Watch", issueDetail: "SEC variance", dailyResidualKwh: 255.024
};

test("shared-feeder evidence produces transparent 57% to 89% confidence gain", () => {
  const result = assessMeasurement(pc);
  assert.equal(result.currentConfidence, .57);
  assert.equal(result.expectedConfidence, .89);
  assert.equal(result.uncertainty, .43);
  assert.equal(result.expectedConfidenceGain, .32);
  assert.ok(result.whyUncertain.some((reason) => reason.includes("6 loads")));
});

test("information value follows annual residual times confidence gain and costs", () => {
  const result = assessMeasurement(pc);
  assert.equal(result.potentialAnnualOpportunityInr, Math.round(255.024 * 312 * 9));
  assert.equal(result.informationValueInr, Math.round(result.potentialAnnualOpportunityInr * .32));
  assert.equal(result.sensorRoi, Number((result.informationValueInr / 12000).toFixed(1)));
  assert.equal(result.measurementJustified, true);
});

test("directly metered or zero-residual issues do not justify another meter", () => {
  const direct = assessMeasurement({ ...pc, meteringMode: "DIRECT_METER" });
  const zero = assessMeasurement({ ...pc, dailyResidualKwh: 0 });
  assert.equal(direct.expectedConfidenceGain, 0);
  assert.equal(direct.measurementJustified, false);
  assert.equal(zero.informationValueInr, 0);
  assert.equal(zero.measurementJustified, false);
});

test("rank by justified information value per measurement cost", () => {
  const smaller = { ...pc, code: "WL-01", dailyResidualKwh: 70.64 };
  const ranked = rankMeasurements([smaller, pc]);
  assert.equal(ranked[0].code, "PC-01");
  assert.ok(ranked[0].sensorRoi > ranked[1].sensorRoi);
});
