import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diagnoseMachine, type MachineProfile, type StateReading } from "../machine-state/engine";
import { eventDiagnosis, normalizedCause, recommendationForReason } from "./rules";

const at = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 0, day, hour - 5, minute - 30));
const profile: MachineProfile = {
  code: "LC-01", productiveKw: [25, 32], idleKw: [9, 12], setupKw: [12, 17], offBelowKw: 1,
  intervalMinutes: 5, shiftWindows: [{ startMinute: 360, endMinute: 1320 }],
  tariffInrPerKwh: 9.2, productionDaysPerMonth: 26, meteringBasis: "DIRECT_METER"
};

describe("operator intelligence", () => {
  it("turns a 32-minute material event into a specific diagnosis and recommendation", () => {
    assert.equal(normalizedCause("WAITING_FOR_MATERIAL"), "MATERIAL_UNAVAILABLE");
    assert.equal(eventDiagnosis("MATERIAL_UNAVAILABLE", 32, 32), "32-minute material-staging delay");
    assert.equal(recommendationForReason("MATERIAL_UNAVAILABLE"), "Improve material staging before job completion.");
  });

  it("changes unexplained idle to material-wait context only when the event overlaps", () => {
    const readings: StateReading[] = [
      ...Array.from({ length: 12 }, (_, index) => ({ timestamp: at(1, 8, index * 5), powerKw: 10.6 })),
      ...Array.from({ length: 24 }, (_, index) => ({ timestamp: at(2, 8 + Math.floor(index * 5 / 60), index * 5 % 60), powerKw: 10.6 }))
    ];
    const noContext = diagnoseMachine({ profile, readings, jobs: [], baselineDays: 1, recentDays: 1 });
    const withContext = diagnoseMachine({ profile, readings, jobs: [], baselineDays: 1, recentDays: 1, events: [
      { startAt: at(2, 8, 20), endAt: at(2, 8, 52), reasonCode: "MATERIAL_UNAVAILABLE", note: "Next sheet batch not staged near laser", source: "DEMO_ENTRY" }
    ] });
    assert.equal(noContext.days[1].potentiallyAvoidableHours, 0);
    const changed = withContext.days[1].intervals.filter((item) => item.reasonCode === "MATERIAL_UNAVAILABLE");
    assert.equal(changed.length, 7);
    assert.ok(changed.every((item) => item.withoutOperatorContextReason === "INSUFFICIENT_CONTEXT"));
    assert.ok(changed.every((item) => item.idleClass === "Potentially Avoidable"));
    assert.equal(changed[0].recommendation, "Improve material staging before job completion.");
  });

  it("keeps setup as necessary and gives entered context priority over generated context", () => {
    const readings: StateReading[] = [
      ...Array.from({ length: 12 }, (_, index) => ({ timestamp: at(1, 8, index * 5), powerKw: 10.6 })),
      ...Array.from({ length: 24 }, (_, index) => ({ timestamp: at(2, 8 + Math.floor(index * 5 / 60), index * 5 % 60), powerKw: 10.6 }))
    ];
    const events = [
      { startAt: at(2, 8, 20), endAt: at(2, 8, 50), reasonCode: "WAITING_FOR_MATERIAL", source: "SIMULATED" },
      { startAt: at(2, 8, 20), endAt: at(2, 8, 50), reasonCode: "SETUP_CHANGEOVER", source: "DEMO_ENTRY" }
    ];
    const result = diagnoseMachine({ profile, readings, jobs: [], baselineDays: 1, recentDays: 1, events });
    const overlap = result.days[1].intervals.filter((item) => item.operatorEventSource === "DEMO_ENTRY");
    assert.equal(overlap.length, 6);
    assert.ok(overlap.every((item) => item.idleClass === "Necessary"));
    assert.equal(result.days[1].potentiallyAvoidableHours, 0);
  });
});
