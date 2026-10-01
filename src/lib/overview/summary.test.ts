import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultConstraints, rankOpportunities, type Evidence } from "@/lib/decision-engine/calculation";
import { summarizeOpportunities } from "./summary";

const evidence: Evidence[] = [
  { machine: "LC-01", dailyAvoidableIdleKwh: 20.76, dailyMachineKwh: 348.665, confidence: .95, diagnosticStatus: "Potential Opportunity", detail: "Between-job idle" },
  { machine: "AC-01", dailyAvoidableIdleKwh: 152.88, dailyMachineKwh: 787.604, confidence: .92, diagnosticStatus: "Potential Opportunity", detail: "Unloaded runtime" },
  { machine: "PC-01", dailyMachineKwh: 534.965, confidence: .64, diagnosticStatus: "Watch", detail: "Low batches" },
  { machine: "WL-01", dailyMachineKwh: 258.726, dailySecExcessKwh: 70.64, confidence: .78, diagnosticStatus: "Potential Loss", detail: "SEC drift" }
];

test("Overview shows distinct machines and does not add LC-01 alternatives", () => {
  const ranked = rankOpportunities(evidence, defaultConstraints);
  const summary = summarizeOpportunities(ranked);
  assert.equal(summary.best?.id, "lc-staging");
  assert.equal(new Set(summary.topThree.map((item) => item.machine)).size, summary.topThree.length);
  assert.equal(summary.identifiedAnnualInr, summary.topThree.reduce((sum, item) => sum + item.annualRupeeSaving, 0));
  assert.equal(summary.largestAnnual?.machine, "AC-01");
});
