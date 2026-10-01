import { interventions, type Intervention } from "../../../data/interventions";

export type ManagerConstraints = {
  maxCapexInr: number;
  preferredPaybackMonths: number;
  minimumProduction: "current-baseline" | "allow-trial-reduction";
  quality: "no-rejection-increase" | "allow-validated-trial";
  riskTolerance: "Low" | "Medium" | "High";
  tariffInrPerKwh: number;
};

export const defaultConstraints: ManagerConstraints = {
  maxCapexInr: 500000, preferredPaybackMonths: 24,
  minimumProduction: "current-baseline", quality: "no-rejection-increase",
  riskTolerance: "Medium", tariffInrPerKwh: 9
};

export type Evidence = {
  machine: Intervention["machine"];
  dailyAvoidableIdleKwh?: number;
  dailyMachineKwh: number;
  dailySecExcessKwh?: number;
  confidence: number;
  diagnosticStatus: string;
  detail: string;
};

export type Opportunity = Intervention & {
  relevantBaselineEnergyKwh: number;
  expectedSavingLowKwh: number;
  expectedSavingHighKwh: number;
  expectedSavingMidKwh: number;
  annualRupeeSaving: number;
  simplePaybackMonths: number;
  fiveYearNetBenefitInr: number;
  diagnosticConfidence: number;
  score: number;
  constraintReasons: string[];
  eligible: boolean;
  whyRankedHere: string;
  evidenceDetail: string;
  basisLabel: string;
  section: "NO CAPEX" | "LOW CAPEX" | "STRATEGIC CAPEX";
};

const round = (value: number, decimals = 1) => Number(value.toFixed(decimals));
const riskLevel = { Low: 0, Medium: 1, High: 2 };
const daysPerYear = 26 * 12;

export function rankOpportunities(evidence: Evidence[], constraints: ManagerConstraints, library = interventions): Opportunity[] {
  const byMachine = new Map(evidence.map((item) => [item.machine, item]));
  const results = library.map((item) => {
    const signal = byMachine.get(item.machine);
    const dailyBasis = signal ? item.basis === "avoidable-idle" ? signal.dailyAvoidableIdleKwh ?? 0 : item.basis === "sec-excess" ? signal.dailySecExcessKwh ?? 0 : signal.dailyMachineKwh : 0;
    const relevantBaselineEnergyKwh = round(Math.max(0, dailyBasis) * daysPerYear);
    const expectedSavingLowKwh = round(relevantBaselineEnergyKwh * item.reductionLow);
    const expectedSavingHighKwh = round(relevantBaselineEnergyKwh * item.reductionHigh);
    const expectedSavingMidKwh = round((expectedSavingLowKwh + expectedSavingHighKwh) / 2);
    const annualRupeeSaving = round(expectedSavingMidKwh * constraints.tariffInrPerKwh, 0);
    const simplePaybackMonths = item.capexInr === 0 && annualRupeeSaving > 0 ? 0 : annualRupeeSaving > 0 ? round(item.capexInr / annualRupeeSaving * 12) : Infinity;
    const fiveYearNetBenefitInr = round(5 * annualRupeeSaving - item.capexInr, 0);
    const diagnosticConfidence = round((signal?.confidence ?? 0) * item.readiness, 2);
    const constraintReasons: string[] = [];
    if (!signal || dailyBasis <= 0) constraintReasons.push("No positive, relevant diagnostic energy basis is available.");
    if (item.capexInr > constraints.maxCapexInr) constraintReasons.push("Exceeds available CAPEX.");
    if (simplePaybackMonths > constraints.preferredPaybackMonths) constraintReasons.push("Exceeds preferred payback.");
    if (riskLevel[item.productionRisk] > riskLevel[constraints.riskTolerance]) constraintReasons.push("Exceeds production risk tolerance.");
    if (constraints.minimumProduction === "current-baseline" && item.productionImpact.startsWith("Potential schedule delay")) constraintReasons.push("Baseline production has not been demonstrated under the revised schedule.");
    if (constraints.quality === "no-rejection-increase" && item.qualityRisk !== "None expected") constraintReasons.push("Quality needs a site trial before the no-increase condition can be confirmed.");
    const eligible = constraintReasons.length === 0;
    // Weighted, bounded score: readiness 30, diagnostic confidence 25, financial benefit 20,
    // payback 10, CAPEX fit 10, production risk 5. A constraint failure excludes selection.
    const financial = Math.min(1, annualRupeeSaving / 40000) * 20;
    const payback = simplePaybackMonths === 0 ? 10 : Math.max(0, 10 * (1 - simplePaybackMonths / Math.max(1, constraints.preferredPaybackMonths)));
    const capexFit = item.capexInr === 0 ? 10 : Math.max(0, 10 * (1 - item.capexInr / Math.max(1, constraints.maxCapexInr)));
    const risk = item.productionRisk === "Low" ? 5 : item.productionRisk === "Medium" ? 2.5 : 0;
    const readinessPoints = item.readiness * 30;
    const confidencePoints = diagnosticConfidence * 25;
    const score = round(readinessPoints + confidencePoints + financial + payback + capexFit + risk);
    const basisLabel = item.basis === "avoidable-idle" ? "Recent potentially avoidable idle energy" : item.basis === "sec-excess" ? "Positive SEC residual above healthy comparable jobs" : "Latest daily machine energy";
    return {
      ...item, relevantBaselineEnergyKwh, expectedSavingLowKwh, expectedSavingHighKwh, expectedSavingMidKwh,
      annualRupeeSaving, simplePaybackMonths, fiveYearNetBenefitInr, diagnosticConfidence, score,
      constraintReasons, eligible, basisLabel,
      evidenceDetail: signal?.detail ?? "Diagnostic input unavailable.",
      whyRankedHere: eligible
        ? `Score ${score}/100 = readiness ${round(readinessPoints)} / 30 + diagnostic confidence ${round(confidencePoints)} / 25 + annual energy value ${round(financial)} / 20 (capped at ₹40,000/year) + payback ${round(payback)} / 10 + CAPEX fit ${round(capexFit)} / 10 + production risk ${round(risk)} / 5. ${item.capexInr === 0 ? "No CAPEX" : `${simplePaybackMonths} month energy-only payback`}.`
        : `Held by manager constraints: ${constraintReasons.join(" ")}`,
      section: item.capexInr === 0 ? "NO CAPEX" as const : item.capexInr <= 75000 ? "LOW CAPEX" as const : "STRATEGIC CAPEX" as const
    };
  });
  return results.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || b.annualRupeeSaving - a.annualRupeeSaving);
}
