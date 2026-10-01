/** One presentation fixture, shared by every LC-01 simulation projection. */
export const LC01_EXCESS_IDLE_MATERIAL_WAIT = {
  id: "LC01_EXCESS_IDLE_MATERIAL_WAIT",
  equipmentId: "LC-01",
  state: "IDLE" as const,
  currentPowerKw: 9.8,
  confidence: .94,
  measurementType: "DIRECT_METER" as const,
  anomaly: "EXCESS_IDLE_BETWEEN_JOBS",
  observedIdleHoursPerDay: 2.4,
  healthyIdleHoursPerDay: .9,
  avoidableIdleHoursPerDay: 1.5,
  operatorReason: "MATERIAL_WAIT",
  recommendedAction: "Improve material staging / job sequencing",
  decision: "Do not replace LC-01 yet.",
  trend: [
    { time: "21:00", kw: 28.0, state: "PRODUCTIVE" },
    { time: "21:10", kw: 29.2, state: "PRODUCTIVE" },
    { time: "21:20", kw: 27.8, state: "PRODUCTIVE" },
    { time: "21:30", kw: 9.7, state: "IDLE" },
    { time: "21:40", kw: 9.9, state: "IDLE" },
    { time: "21:50", kw: 9.8, state: "IDLE" },
    { time: "22:00", kw: 9.6, state: "IDLE" },
    { time: "22:10", kw: 9.8, state: "IDLE" }
  ]
} as const;

export const LC01_SCENARIO_COOKIE = "factorypulse-lc01-scenario";

const istMinute = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Project only LC-01's presentation-period samples; all values remain simulated. */
export function projectLc01Reading<T extends { timestamp: Date | string; powerKw: number; energyKwh: number; state: string }>(reading: T, intervalMinutes: number): T {
  const time = istMinute.format(new Date(reading.timestamp));
  const [hour, minute] = time.split(":").map(Number);
  const clockMinute = hour * 60 + minute;
  const trend = LC01_EXCESS_IDLE_MATERIAL_WAIT.trend.find((point) => point.time === time);
  const scenarioIdle = (clockMinute >= 12 * 60 && clockMinute < 12 * 60 + 55)
    || (clockMinute >= 17 * 60 && clockMinute < 17 * 60 + 45)
    || (clockMinute >= 21 * 60 + 30 && clockMinute <= 22 * 60 + 10);
  const newState = scenarioIdle ? "IDLE" : trend?.state === "PRODUCTIVE" ? "PRODUCTIVE"
    : reading.state === "IDLE" || reading.state === "STANDBY" ? "OFF" : reading.state;
  const newPower = scenarioIdle ? trend?.kw ?? LC01_EXCESS_IDLE_MATERIAL_WAIT.currentPowerKw
    : trend?.state === "PRODUCTIVE" ? trend.kw : newState === "OFF" ? .1 : reading.powerKw;
  return { ...reading, state: newState, powerKw: newPower, energyKwh: Number((newPower * intervalMinutes / 60).toFixed(3)) };
}

/** Small, deterministic tick-to-tick power movement for other energized loads. */
export function scenarioPowerDeltaKw(basePowerKw: number, tick: number, equipmentOrdinal: number) {
  if (basePowerKw <= 1) return 0;
  return Number((basePowerKw * .012 * Math.sin(tick * .85 + equipmentOrdinal * 1.7)).toFixed(3));
}
