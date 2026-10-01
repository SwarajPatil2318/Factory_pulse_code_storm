import test from "node:test";
import assert from "node:assert/strict";
import { LC01_EXCESS_IDLE_MATERIAL_WAIT as scenario, projectLc01Reading, scenarioPowerDeltaKw } from "./lc01-demo-scenario";

test("fixed LC-01 storyline keeps the last productive sample and idle endpoint consistent", () => {
  const reading = (localTime: string) => ({
    timestamp: new Date(`2026-09-28T${localTime}:00+05:30`),
    powerKw: .1, energyKwh: .1 / 12, state: "OFF"
  });
  const productive = projectLc01Reading(reading("21:20"), 5);
  const idle = projectLc01Reading(reading("21:30"), 5);
  const current = projectLc01Reading(reading("22:10"), 5);
  assert.equal(productive.state, "PRODUCTIVE");
  assert.equal(productive.powerKw, 27.8);
  assert.equal(idle.state, "IDLE");
  assert.equal(idle.powerKw, 9.7);
  assert.equal(current.state, "IDLE");
  assert.equal(current.powerKw, scenario.currentPowerKw);
  assert.equal(current.energyKwh, Number((9.8 * 5 / 60).toFixed(3)));
  assert.equal(scenario.observedIdleHoursPerDay - scenario.healthyIdleHoursPerDay, scenario.avoidableIdleHoursPerDay);
});

test("other live-simulation loads vary slightly while off loads stay still", () => {
  const first = scenarioPowerDeltaKw(50, 1, 3);
  const next = scenarioPowerDeltaKw(50, 2, 3);
  assert.notEqual(first, next);
  assert.ok(Math.abs(first) <= .6 && Math.abs(next) <= .6);
  assert.equal(scenarioPowerDeltaKw(.1, 2, 3), 0);
});
