/** Transparent, deterministic production-aware energy accounting. No model fitting. */
export type PerformanceState = "Normal" | "Watch" | "Potential Loss" | "Confirmed Opportunity";
export type OutputUnit = "good job" | "good component" | "coated component" | "finished good unit" | "productive factory hour";
export type MeteringMode = "DIRECT_METER" | "FEEDER_METER" | "INFERRED" | "UNMETERED";

export type EnergyObservation = {
  id: string;
  equipmentId: string;
  equipmentCode: string;
  productId: string;
  productMix?: Record<string, number>;
  quantity: number;
  batchSize: number;
  shift: string;
  durationMinutes: number;
  energyKwh: number;
  usefulOutput: number;
  outputUnit: OutputUnit;
  at: Date;
  healthy: boolean;
  meteringMode: MeteringMode;
  contextSignals: string[];
};

export type EnergyAssessment = {
  observationId: string;
  equipmentCode: string;
  productId: string;
  shift: string;
  at: string;
  outputUnit: OutputUnit;
  usefulOutput: number;
  actualSec: number | null;
  baselineSec: number | null;
  expectedEnergyKwh: number | null;
  actualEnergyKwh: number;
  residualKwh: number | null;
  deviationPercent: number | null;
  confidence: number;
  comparableCount: number;
  comparisonLevel: string;
  repeatCount: number;
  state: PerformanceState;
  reasons: string[];
  source: "SIMULATED";
};

const round = (n: number, digits = 3) => Number(n.toFixed(digits));
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function sec(energyKwh: number, usefulOutput: number): number | null {
  return Number.isFinite(energyKwh) && energyKwh >= 0 && Number.isFinite(usefulOutput) && usefulOutput > 0 ? energyKwh / usefulOutput : null;
}
const relativeGap = (a: number, b: number) => b > 0 ? Math.abs(a - b) / b : a === b ? 0 : Infinity;
export function productMixDistance(a?: Record<string, number>, b?: Record<string, number>) {
  if (!a && !b) return 0;
  if (!a || !b) return Infinity;
  const products = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...products].reduce((sum, product) => sum + Math.abs((a[product] ?? 0) - (b[product] ?? 0)), 0) / 2;
}

export function comparableHealthyJobs(target: EnergyObservation, baseline: EnergyObservation[]) {
  const healthy = baseline.filter((row) => row.healthy && row.at < target.at && row.id !== target.id &&
    row.equipmentId === target.equipmentId && row.productId === target.productId && row.outputUnit === target.outputUnit && sec(row.energyKwh, row.usefulOutput) !== null);
  const levels = [
    { name: target.productMix ? "Same equipment, product mix, shift, batch and duration" : "Same equipment, product, shift, batch and duration", score: 1, match: (row: EnergyObservation) => row.shift === target.shift && productMixDistance(row.productMix, target.productMix) <= 0.2 && relativeGap(row.batchSize, target.batchSize) <= 0.25 && relativeGap(row.durationMinutes, target.durationMinutes) <= 0.25 },
    { name: target.productMix ? "Same equipment, product mix and shift; wider batch/duration band" : "Same equipment, product and shift; wider batch/duration band", score: 0.82, match: (row: EnergyObservation) => row.shift === target.shift && productMixDistance(row.productMix, target.productMix) <= 0.35 && relativeGap(row.batchSize, target.batchSize) <= 0.4 && relativeGap(row.durationMinutes, target.durationMinutes) <= 0.4 },
    { name: target.productMix ? "Same equipment and product mix; shifts pooled" : "Same equipment and product; shifts pooled", score: 0.64, match: (row: EnergyObservation) => productMixDistance(row.productMix, target.productMix) <= 0.5 && relativeGap(row.batchSize, target.batchSize) <= 0.4 && relativeGap(row.durationMinutes, target.durationMinutes) <= 0.4 },
    { name: "Same equipment and product; context extrapolated", score: 0.45, match: (row: EnergyObservation) => row.shift === target.shift && relativeGap(row.durationMinutes, target.durationMinutes) <= 0.4 }
  ];
  for (const level of levels) {
    const rows = healthy.filter(level.match);
    if (rows.length >= 5) return { rows, level: level.name, matchScore: level.score };
  }
  return { rows: [] as EnergyObservation[], level: "Insufficient comparable healthy history", matchScore: 0 };
}

function robustBaseline(rows: EnergyObservation[]) {
  const values = rows.map((row) => sec(row.energyKwh, row.usefulOutput)!).filter(Number.isFinite);
  const centre = median(values);
  if (centre === null) return { value: null, count: 0, spread: 0 };
  const mad = median(values.map((value) => Math.abs(value - centre))) ?? 0;
  const limit = Math.max(centre * 0.08, mad * 3.5);
  const retained = values.filter((value) => Math.abs(value - centre) <= limit);
  return { value: median(retained), count: retained.length, spread: centre > 0 ? mad / centre : 0 };
}

function confidenceFor(mode: MeteringMode, count: number, matchScore: number, spread: number) {
  const meter = { DIRECT_METER: 0.94, FEEDER_METER: 0.76, INFERRED: 0.54, UNMETERED: 0.28 }[mode];
  const sample = Math.min(1, count / 12);
  const stability = Math.max(0, 1 - spread / 0.3);
  const score = 0.35 * meter + 0.25 * sample + 0.25 * matchScore + 0.15 * stability;
  return round(Math.min(mode === "UNMETERED" ? 0.55 : mode === "INFERRED" ? 0.74 : matchScore < 0.6 ? 0.64 : 1, score), 2);
}

export function assessEnergy(target: EnergyObservation, baseline: EnergyObservation[], recent: EnergyObservation[] = []): EnergyAssessment {
  const actualSec = sec(target.energyKwh, target.usefulOutput);
  const comparison = comparableHealthyJobs(target, baseline);
  const robust = robustBaseline(comparison.rows);
  const baselineSec = robust.count >= 5 ? robust.value : null;
  const expected = baselineSec !== null && actualSec !== null ? baselineSec * target.usefulOutput : null;
  const residual = expected !== null ? target.energyKwh - expected : null;
  const deviation = expected !== null && expected > 0 ? residual! / expected * 100 : null;
  const confidence = baselineSec === null ? 0 : confidenceFor(target.meteringMode, robust.count, comparison.matchScore, robust.spread);
  const watchThreshold = Math.max(8, robust.spread * 200);
  const priorElevated = baselineSec === null ? [] : recent.filter((row) => row.at < target.at && row.equipmentId === target.equipmentId && row.productId === target.productId && row.shift === target.shift && row.outputUnit === target.outputUnit && row.at.getTime() >= target.at.getTime() - 10 * 86_400_000 && (sec(row.energyKwh, row.usefulOutput)! / baselineSec - 1) * 100 >= 15);
  const repeatCount = new Set(priorElevated.map((row) => row.at.toISOString().slice(0, 10))).size;
  const reasons: string[] = [];
  if (actualSec === null) reasons.push("Useful output is zero or energy is invalid; SEC cannot be calculated.");
  if (baselineSec === null) reasons.push("Fewer than five comparable healthy observations; expected energy is withheld.");
  let state: PerformanceState = "Normal";
  if (baselineSec === null || actualSec === null) state = "Watch";
  else {
    reasons.push(`Baseline is the median SEC of ${robust.count} healthy observations: ${comparison.level.toLowerCase()}.`);
    reasons.push(`Confidence ${Math.round(confidence * 100)}% reflects ${target.meteringMode.toLowerCase().replaceAll("_", " ")} coverage, comparison count, context match and baseline spread.`);
    if (comparison.matchScore < 0.6) reasons.push("Batch size or product mix lies outside the healthy comparison band; expectation is extrapolated and confidence is capped.");
    if (deviation! <= 0) reasons.push("Actual energy is at or below the output-adjusted baseline; no excess-energy claim.");
    else if (deviation! <= watchThreshold) reasons.push(`Residual is within the ${round(watchThreshold, 1)}% context band; no excess-energy claim.`);
    else {
      reasons.push(`Actual energy is ${round(deviation!, 1)}% above output-adjusted expectation; this is a deviation, not proof of waste.`);
      reasons.push(`${repeatCount} prior elevated day${repeatCount === 1 ? "" : "s"} in the same equipment, product and shift context.`);
      if (target.contextSignals.length) reasons.push(...target.contextSignals);
      if (deviation! < 15 || confidence < 0.65 || repeatCount < 2) state = "Watch";
      else if (deviation! >= 25 && confidence >= 0.75 && repeatCount >= 3 && target.contextSignals.length > 0 && ["DIRECT_METER", "FEEDER_METER"].includes(target.meteringMode)) state = "Confirmed Opportunity";
      else state = "Potential Loss";
    }
  }
  if (target.meteringMode === "INFERRED" || target.meteringMode === "UNMETERED") reasons.push("Consumption is inferred or unmetered; field verification is required before confirmation.");
  if (state === "Watch" && deviation !== null && deviation > watchThreshold) reasons.push("Watch: the deviation lacks enough repeated, well-metered evidence to call it a loss.");
  if (state === "Potential Loss") reasons.push("Potential Loss: repeat deviation warrants an engineering investigation.");
  if (state === "Confirmed Opportunity") reasons.push("Confirmed Opportunity: repeated deviation, strong measurement basis and an independent operating signal agree; savings still require verification.");
  return {
    observationId: target.id, equipmentCode: target.equipmentCode, productId: target.productId, shift: target.shift,
    at: target.at.toISOString(), outputUnit: target.outputUnit, usefulOutput: target.usefulOutput,
    actualSec: actualSec === null ? null : round(actualSec), baselineSec: baselineSec === null ? null : round(baselineSec),
    expectedEnergyKwh: expected === null ? null : round(expected), actualEnergyKwh: round(target.energyKwh),
    residualKwh: residual === null ? null : round(residual), deviationPercent: deviation === null ? null : round(deviation, 1),
    confidence, comparableCount: robust.count, comparisonLevel: comparison.level, repeatCount, state, reasons, source: "SIMULATED"
  };
}
