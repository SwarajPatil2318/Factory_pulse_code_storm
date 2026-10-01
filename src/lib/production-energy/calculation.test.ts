import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assessEnergy, comparableHealthyJobs, median, productMixDistance, sec, type EnergyObservation } from "./calculation";

const date = (day: number) => new Date(Date.UTC(2026, 0, day));
function observation(day: number, overrides: Partial<EnergyObservation> = {}): EnergyObservation {
  return {
    id: `job-${day}`, equipmentId: "eq-wl01", equipmentCode: "WL-01", productId: "P-001",
    quantity: 100, batchSize: 100, shift: "A", durationMinutes: 120, energyKwh: 100,
    usefulOutput: 100, outputUnit: "good component", at: date(day), healthy: true,
    meteringMode: "DIRECT_METER", contextSignals: [], ...overrides
  };
}
const healthy = Array.from({ length: 12 }, (_, index) => observation(index + 1));

describe("production-aware energy calculations", () => {
  it("calculates median SEC and withholds SEC for zero output", () => {
    assert.equal(median([5, 1, 9, 3]), 4);
    assert.equal(sec(120, 60), 2);
    assert.equal(sec(120, 0), null);
    assert.equal(sec(-1, 10), null);
  });

  it("matches equipment, product, shift, batch and duration; excludes unhealthy history", () => {
    const rows = [
      ...healthy.slice(0, 5),
      observation(6, { id: "wrong-product", productId: "P-002" }),
      observation(7, { id: "wrong-shift", shift: "B" }),
      observation(8, { id: "large-batch", batchSize: 170 }),
      observation(9, { id: "fault", healthy: false })
    ];
    const match = comparableHealthyJobs(observation(20), rows);
    assert.equal(match.rows.length, 5);
    assert.equal(match.matchScore, 1);
  });

  it("matches daily factory history by product mix", () => {
    assert.ok(Math.abs(productMixDistance({ A: 0.5, B: 0.5 }, { A: 0.6, B: 0.4 }) - 0.1) < 1e-9);
    const baseline = healthy.map((row) => ({ ...row, productId: "MIXED", productMix: { A: 0.8, B: 0.2 } }));
    const target = observation(25, { productId: "MIXED", productMix: { A: 0.2, B: 0.8 } });
    const result = comparableHealthyJobs(target, baseline);
    assert.equal(result.level, "Same equipment and product; context extrapolated");
    assert.equal(result.matchScore, 0.45);
  });

  it("uses a robust median and reports expected, actual, residual and deviation", () => {
    const baseline = [...healthy.slice(0, 11), observation(12, { energyKwh: 1000 })];
    const result = assessEnergy(observation(25, { energyKwh: 130 }), baseline);
    assert.equal(result.baselineSec, 1);
    assert.equal(result.expectedEnergyKwh, 100);
    assert.equal(result.actualEnergyKwh, 130);
    assert.equal(result.residualKwh, 30);
    assert.equal(result.deviationPercent, 30);
    assert.equal(result.state, "Watch");
    assert.ok(result.reasons.some((reason) => reason.includes("not proof of waste")));
  });

  it("requires repeated evidence and a corroborating signal to confirm an opportunity", () => {
    const target = observation(25, { energyKwh: 130, contextSignals: ["Idle runtime exceeded the healthy median."] });
    const prior = [22, 23, 24].map((day) => observation(day, { energyKwh: 130 }));
    const confirmed = assessEnergy(target, healthy, prior);
    assert.equal(confirmed.repeatCount, 3);
    assert.equal(confirmed.state, "Confirmed Opportunity");
    assert.equal(assessEnergy(target, healthy, prior.slice(0, 2)).state, "Potential Loss");
    assert.equal(assessEnergy({ ...target, contextSignals: [] }, healthy, prior).state, "Potential Loss");
  });

  it("caps confidence for extrapolated batches and never confirms inferred consumption", () => {
    const prior = [22, 23, 24].map((day) => observation(day, { energyKwh: 150 }));
    const lowBatch = assessEnergy(observation(25, { quantity: 50, batchSize: 50, usefulOutput: 50, energyKwh: 100, contextSignals: ["Small batch"] }), healthy, prior);
    assert.equal(lowBatch.comparisonLevel, "Same equipment and product; context extrapolated");
    assert.ok(lowBatch.confidence <= 0.64);
    assert.equal(lowBatch.state, "Watch");
    const inferred = assessEnergy(observation(25, { energyKwh: 150, meteringMode: "INFERRED", contextSignals: ["Idle runtime rose"] }), healthy, prior);
    assert.notEqual(inferred.state, "Confirmed Opportunity");
  });

  it("withholds expected energy when comparable healthy history is sparse", () => {
    const result = assessEnergy(observation(25), healthy.slice(0, 4));
    assert.equal(result.baselineSec, null);
    assert.equal(result.expectedEnergyKwh, null);
    assert.equal(result.confidence, 0);
    assert.equal(result.state, "Watch");
  });
});
