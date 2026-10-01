import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultConstraints, rankOpportunities, type Evidence } from "./calculation";

const evidence: Evidence[] = [
  { machine: "LC-01", dailyAvoidableIdleKwh: 20.76, dailyMachineKwh: 348.665, confidence: .95, diagnosticStatus: "Potential Opportunity", detail: "Between-job idle" },
  { machine: "AC-01", dailyAvoidableIdleKwh: 152.88, dailyMachineKwh: 787.604, confidence: .92, diagnosticStatus: "Potential Opportunity", detail: "Unloaded runtime" },
  { machine: "PC-01", dailyMachineKwh: 534.965, confidence: .64, diagnosticStatus: "Watch", detail: "Low batches" },
  { machine: "WL-01", dailyMachineKwh: 258.726, dailySecExcessKwh: 70.64, confidence: .78, diagnosticStatus: "Potential Loss", detail: "SEC drift" }
];

test("annual saving, tariff, payback and net benefit use the relevant energy basis", () => {
  const action = rankOpportunities(evidence, defaultConstraints).find((item) => item.id === "lc-standby")!;
  assert.equal(action.relevantBaselineEnergyKwh, Number((20.76 * 312).toFixed(1)));
  assert.equal(action.expectedSavingLowKwh, Number((action.relevantBaselineEnergyKwh * .55).toFixed(1)));
  assert.equal(action.expectedSavingHighKwh, Number((action.relevantBaselineEnergyKwh * .75).toFixed(1)));
  assert.equal(action.annualRupeeSaving, Math.round(action.expectedSavingMidKwh * 9));
  assert.equal(action.simplePaybackMonths, Number((35000 / action.annualRupeeSaving * 12).toFixed(1)));
  assert.equal(action.fiveYearNetBenefitInr, 5 * action.annualRupeeSaving - 35000);
});

test("default ranking selects staging and holds replacement for budget and payback", () => {
  const actions = rankOpportunities(evidence, defaultConstraints);
  assert.equal(actions.find((item) => item.eligible)?.id, "lc-staging");
  const replacement = actions.find((item) => item.id === "lc-replace")!;
  assert.equal(replacement.eligible, false);
  assert.ok(replacement.constraintReasons.some((reason) => reason.includes("CAPEX")));
  assert.ok(replacement.constraintReasons.some((reason) => reason.includes("payback")));
  assert.equal(actions.find((item) => item.id === "pc-consolidate")?.eligible, false);
});

test("tariff and manager constraints recalculate scenarios without changing energy", () => {
  const base = rankOpportunities(evidence, defaultConstraints).find((item) => item.id === "ac-sequencing")!;
  const changed = rankOpportunities(evidence, { ...defaultConstraints, tariffInrPerKwh: 12, maxCapexInr: 10000 }).find((item) => item.id === "ac-sequencing")!;
  assert.equal(changed.expectedSavingMidKwh, base.expectedSavingMidKwh);
  assert.equal(changed.annualRupeeSaving, Math.round(base.expectedSavingMidKwh * 12));
  assert.equal(changed.eligible, false);
  assert.ok(changed.constraintReasons.some((reason) => reason.includes("CAPEX")));
});

test("production and quality guardrails hold uncertain actions until explicitly relaxed", () => {
  const strict = rankOpportunities(evidence, defaultConstraints).find((item) => item.id === "pc-consolidate")!;
  assert.equal(strict.eligible, false);
  assert.equal(strict.constraintReasons.length, 2);
  const trial = rankOpportunities(evidence, { ...defaultConstraints, minimumProduction: "allow-trial-reduction", quality: "allow-validated-trial" }).find((item) => item.id === "pc-consolidate")!;
  assert.equal(trial.eligible, true);
  assert.equal(trial.qualityRisk, "Requires validation");
});
