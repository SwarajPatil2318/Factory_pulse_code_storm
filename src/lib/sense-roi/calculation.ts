export type SenseCandidate = {
  equipmentId: string;
  code: string;
  name: string;
  parentCode: string | null;
  meteringMode: string;
  sharedFeederMachines: number;
  recentJobCount: number;
  recentOperatorEventCount: number;
  healthyComparableCount: number;
  repeatCount: number;
  issueState: string;
  issueDetail: string;
  dailyResidualKwh: number;
};

export type ConfidenceFactor = { label: string; points: number; reason: string };
export type SenseAssessment = SenseCandidate & {
  currentConfidence: number;
  expectedConfidence: number;
  expectedConfidenceGain: number;
  uncertainty: number;
  confidenceFactors: ConfidenceFactor[];
  whyUncertain: string[];
  potentialAnnualOpportunityInr: number;
  informationValueInr: number;
  sensorCostInr: number;
  durationDays: number;
  sensorRoi: number;
  measurementJustified: boolean;
  measurementName: string;
};

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number) => Math.min(.95, Math.max(.05, value));

/** Deliberately simple demo evidence score, separate from the production-energy SEC confidence. */
export function confidenceForMeasurement(candidate: SenseCandidate, withDirectMeter = false) {
  const direct = withDirectMeter || candidate.meteringMode === "DIRECT_METER";
  const feeder = !direct && candidate.meteringMode === "FEEDER_METER";
  const hasJobs = candidate.recentJobCount >= 7;
  const hasOperator = candidate.recentOperatorEventCount > 0;
  const enoughHistory = candidate.healthyComparableCount >= 10;
  const limitedHistory = candidate.healthyComparableCount < 5;
  const repeated = candidate.repeatCount >= 3;
  const shared = !direct && candidate.sharedFeederMachines > 1;
  const factors: ConfidenceFactor[] = [
    { label: "Starting evidence", points: .34, reason: "A production-aware deviation exists but is not a verified loss." },
    { label: "Measurement", points: direct ? .28 : feeder ? .10 : candidate.meteringMode === "INFERRED" ? 0 : -.04, reason: direct ? "Direct equipment meter" : feeder ? "Upstream feeder meter only" : "No direct equipment measurement" },
    { label: "Production records", points: hasJobs ? .12 : candidate.recentJobCount > 0 ? .06 : 0, reason: hasJobs ? `${candidate.recentJobCount} recent jobs` : candidate.recentJobCount ? "Some recent jobs" : "No recent job records" },
    { label: "Operator context", points: hasOperator ? .08 : -.04, reason: hasOperator ? `${candidate.recentOperatorEventCount} recent events` : "No recent operator explanation" },
    { label: "Healthy comparison", points: enoughHistory ? .10 : limitedHistory ? -.06 : .06, reason: enoughHistory ? `${candidate.healthyComparableCount} comparable healthy observations` : limitedHistory ? "Limited healthy history" : `${candidate.healthyComparableCount} comparable healthy observations` },
    { label: "Repeated occurrence", points: repeated ? .09 : candidate.repeatCount > 0 ? .04 : 0, reason: repeated ? `${candidate.repeatCount} repeated elevated observations` : "Limited repeated evidence" },
    { label: "Shared feeder", points: shared ? -.14 : 0, reason: shared ? `${candidate.sharedFeederMachines} loads share ${candidate.parentCode ?? "the feeder"}` : "No shared-feeder attribution penalty" }
  ];
  return { confidence: round(clamp(factors.reduce((sum, factor) => sum + factor.points, 0))), factors };
}

export function assessMeasurement(candidate: SenseCandidate, tariffInrPerKwh = 9, productionDaysPerYear = 312, sensorCostInr = 12000, durationDays = 7): SenseAssessment {
  const current = confidenceForMeasurement(candidate);
  const measured = confidenceForMeasurement(candidate, true);
  const gain = round(Math.max(0, measured.confidence - current.confidence));
  const annualOpportunity = round(Math.max(0, candidate.dailyResidualKwh) * productionDaysPerYear * tariffInrPerKwh, 0);
  const informationValue = round(annualOpportunity * gain, 0);
  const roi = sensorCostInr > 0 ? round(informationValue / sensorCostInr, 1) : 0;
  const whyUncertain = current.factors.filter((factor) => factor.points < 0 || factor.label === "Measurement" && candidate.meteringMode !== "DIRECT_METER").map((factor) => factor.reason);
  return {
    ...candidate, currentConfidence: current.confidence, expectedConfidence: measured.confidence,
    expectedConfidenceGain: gain, uncertainty: round(1 - current.confidence), confidenceFactors: current.factors,
    whyUncertain, potentialAnnualOpportunityInr: annualOpportunity, informationValueInr: informationValue,
    sensorCostInr, durationDays, sensorRoi: roi, measurementJustified: gain >= .1 && informationValue >= sensorCostInr,
    measurementName: `${candidate.code} temporary branch meter`
  };
}

export function rankMeasurements(candidates: SenseCandidate[], tariffInrPerKwh = 9, productionDaysPerYear = 312) {
  return candidates.map((candidate) => assessMeasurement(candidate, tariffInrPerKwh, productionDaysPerYear))
    .sort((a, b) => Number(b.measurementJustified) - Number(a.measurementJustified) || b.sensorRoi - a.sensorRoi || b.informationValueInr - a.informationValueInr);
}
