import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diagnoseMachine, interpretInterval, type MachineProfile, type StateEvent, type StateReading } from "./engine";

const profile: MachineProfile = {
  code: "LC-01", productiveKw: [25, 32], idleKw: [9, 12], setupKw: [12, 17], offBelowKw: 1,
  intervalMinutes: 5, shiftWindows: [{ startMinute: 360, endMinute: 840 }, { startMinute: 840, endMinute: 1320 }],
  tariffInrPerKwh: 9.2, productionDaysPerMonth: 26, meteringBasis: "DIRECT_METER"
};
const at = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 0, day, hour - 5, minute - 30));
const job = { id: "JOB-1", actualStart: at(1, 8), actualEnd: at(1, 9), goodUnits: 80, shift: "A" };

describe("machine state interpretation", () => {
  it("uses power plus active job, optional state signal and shift context", () => {
    assert.equal(interpretInterval({ timestamp: at(1, 8), powerKw: 28 }, profile, [job], [], []).state, "PRODUCTIVE");
    assert.equal(interpretInterval({ timestamp: at(1, 10), powerKw: 10.5 }, profile, [job], [], []).state, "IDLE");
    assert.equal(interpretInterval({ timestamp: at(1, 23), powerKw: 10.5 }, profile, [], [], []).state, "STANDBY");
    assert.equal(interpretInterval({ timestamp: at(1, 10), powerKw: 0.2 }, profile, [], [], []).state, "OFF");
    assert.equal(interpretInterval({ timestamp: at(1, 8), powerKw: 14 }, profile, [], [{ startAt: at(1, 8), endAt: at(1, 8, 10), state: "SETUP", source: "SIMULATED_PLC" }], []).state, "SETUP");
    assert.equal(interpretInterval({ timestamp: at(1, 8), powerKw: 28 }, profile, [job], [{ startAt: at(1, 8), endAt: at(1, 8, 10), state: "FAULT", source: "SIMULATED_PLC" }], []).state, "FAULT");
  });

  it("uses plant activity for a compressor without a direct production job", () => {
    const compressor = { ...profile, code: "AC-01", productiveKw: [45, 55] as const, idleKw: [16, 22] as const, productiveWithoutJob: true };
    assert.equal(interpretInterval({ timestamp: at(1, 8), powerKw: 50 }, compressor, [], [], [], true).state, "PRODUCTIVE");
    assert.equal(interpretInterval({ timestamp: at(1, 8), powerKw: 19 }, compressor, [], [], [], true).state, "IDLE");
    assert.equal(interpretInterval({ timestamp: at(1, 8), powerKw: 50 }, compressor, [], [], [], false).state, "PRODUCTIVE");
  });

  it("separates necessary, candidate avoidable and unexplained idle; caps opportunity at baseline excess", () => {
    const readings: StateReading[] = [
      ...Array.from({ length: 12 }, (_, index) => ({ timestamp: at(1, 8, index * 5), powerKw: 10 })),
      ...Array.from({ length: 24 }, (_, index) => ({ timestamp: at(2, 8 + Math.floor(index * 5 / 60), index * 5 % 60), powerKw: 10 }))
    ];
    const events: StateEvent[] = [
      { startAt: at(2, 8), endAt: at(2, 8, 20), reasonCode: "LOADING_UNLOADING", source: "SIMULATED" },
      { startAt: at(2, 8, 20), endAt: at(2, 9, 40), reasonCode: "WAITING_FOR_MATERIAL", source: "SIMULATED" }
    ];
    const result = diagnoseMachine({ profile, readings, jobs: [], events, baselineDays: 1, recentDays: 1, outputJobs: [
      { ...job, actualStart: at(1, 7), actualEnd: at(1, 7, 30), goodUnits: 80 },
      { ...job, id: "JOB-2", actualStart: at(2, 7), actualEnd: at(2, 7, 30), goodUnits: 80 }
    ] });
    const day = result.days[1];
    assert.equal(day.idleHours, 2);
    assert.equal(day.baselineIdleHours, 1);
    assert.equal(day.necessaryIdleHours, 0.33);
    assert.equal(day.potentiallyAvoidableHours, 1);
    assert.equal(day.unexplainedIdleHours, 0.67);
    assert.equal(day.idleEnergyKwh, 20);
    assert.equal(day.avoidableIdleEnergyKwh, 10);
    assert.equal(day.costImpactInr, 92);
    assert.equal(result.monthlyEnergyKwh, 260);
    assert.equal(result.annualImpactInr, 28704);
    assert.equal(result.status, "Potential Opportunity");
    assert.ok(day.intervals.some((item) => item.idleClass === "Unexplained" && item.reasonCode === "WITHIN_HEALTHY_IDLE_ALLOWANCE"));
  });
});
