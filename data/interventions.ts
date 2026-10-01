export const INTERVENTION_DISCLAIMER = "Illustrative demo assumptions — production deployment requires site/OEM/BEE validation.";

export type Intervention = {
  id: string;
  machine: "LC-01" | "AC-01" | "PC-01" | "WL-01";
  issue: string;
  action: string;
  rationale: string;
  capexInr: number;
  reductionLow: number;
  reductionHigh: number;
  basis: "avoidable-idle" | "total-machine" | "sec-excess";
  productionImpact: string;
  productionRisk: "Low" | "Medium" | "High";
  qualityRisk: "None expected" | "Requires validation" | "Possible increase";
  difficulty: "Easy" | "Moderate" | "Complex";
  throughputImprovement?: [number, number];
  readiness: number;
};

export const interventions: Intervention[] = [
  { id: "lc-staging", machine: "LC-01", issue: "Excess idle between jobs", action: "Improve material staging / job sequencing", rationale: "Stage the next sheet batch before the current job finishes and close avoidable gaps between jobs.", capexInr: 0, reductionLow: .35, reductionHigh: .55, basis: "avoidable-idle", productionImpact: "Target: restore baseline output through smoother job handoff", productionRisk: "Low", qualityRisk: "None expected", difficulty: "Easy", readiness: 1 },
  { id: "lc-standby", machine: "LC-01", issue: "Excess idle between jobs", action: "Automatic standby control", rationale: "Reduce power during confirmed idle intervals after checking restart time against the schedule.", capexInr: 35000, reductionLow: .55, reductionHigh: .75, basis: "avoidable-idle", productionImpact: "Baseline output maintained after restart validation", productionRisk: "Low", qualityRisk: "None expected", difficulty: "Moderate", readiness: .84 },
  { id: "lc-replace", machine: "LC-01", issue: "Excess idle between jobs", action: "Replace laser cutter", rationale: "A newer machine may lower total machine energy, but energy-only economics and current CAPEX must justify replacement.", capexInr: 2800000, reductionLow: .18, reductionHigh: .25, basis: "total-machine", productionImpact: "Illustrative throughput improvement of 15–25%; commissioning risk", productionRisk: "Medium", qualityRisk: "Requires validation", difficulty: "Complex", throughputImprovement: [.15, .25], readiness: .35 },
  { id: "ac-sequencing", machine: "AC-01", issue: "Excess unloaded runtime", action: "Improve shutdown / sequencing logic", rationale: "Switch off during verified no-demand windows; confirm air demand before changing controls.", capexInr: 15000, reductionLow: .25, reductionHigh: .40, basis: "avoidable-idle", productionImpact: "Baseline output maintained if air demand is verified", productionRisk: "Low", qualityRisk: "None expected", difficulty: "Moderate", readiness: .64 },
  { id: "ac-leaks", machine: "AC-01", issue: "Excess unloaded runtime", action: "Leak / pressure optimization", rationale: "Survey leaks and pressure setpoints to reduce whole-compressor energy.", capexInr: 25000, reductionLow: .08, reductionHigh: .15, basis: "total-machine", productionImpact: "Baseline output maintained after pressure checks", productionRisk: "Low", qualityRisk: "Requires validation", difficulty: "Moderate", readiness: .58 },
  { id: "ac-vfd", machine: "AC-01", issue: "Excess unloaded runtime", action: "VFD retrofit", rationale: "Match motor speed to verified variable air demand; confirm OEM suitability first.", capexInr: 280000, reductionLow: .15, reductionHigh: .25, basis: "total-machine", productionImpact: "Baseline output maintained after controls validation", productionRisk: "Medium", qualityRisk: "Requires validation", difficulty: "Complex", readiness: .42 },
  { id: "pc-consolidate", machine: "PC-01", issue: "Low batch utilisation", action: "Consolidate powder-coating batches", rationale: "Fill the oven more effectively while checking dispatch and work-in-progress limits.", capexInr: 0, reductionLow: .10, reductionHigh: .20, basis: "total-machine", productionImpact: "Potential schedule delay; prove current throughput first", productionRisk: "Medium", qualityRisk: "Requires validation", difficulty: "Moderate", readiness: .40 },
  { id: "pc-schedule", machine: "PC-01", issue: "Low batch utilisation", action: "Scheduling optimization", rationale: "Sequence compatible coating work to reduce underfilled heat cycles.", capexInr: 0, reductionLow: .08, reductionHigh: .15, basis: "total-machine", productionImpact: "Potential schedule delay; prove current throughput first", productionRisk: "Medium", qualityRisk: "Requires validation", difficulty: "Moderate", readiness: .45 },
  { id: "pc-controls", machine: "PC-01", issue: "Low batch utilisation", action: "Oven insulation / control improvement", rationale: "Reduce oven losses after confirming thermal profile and coating quality.", capexInr: 120000, reductionLow: .08, reductionHigh: .14, basis: "total-machine", productionImpact: "Baseline output maintained after process validation", productionRisk: "Medium", qualityRisk: "Requires validation", difficulty: "Complex", readiness: .48 },
  { id: "wl-process", machine: "WL-01", issue: "SEC degradation", action: "Operator / process correction", rationale: "Review weld settings and operating practice against healthy good-component SEC.", capexInr: 0, reductionLow: .08, reductionHigh: .15, basis: "sec-excess", productionImpact: "Baseline output maintained after trial", productionRisk: "Medium", qualityRisk: "Requires validation", difficulty: "Moderate", readiness: .62 },
  { id: "wl-maintenance", machine: "WL-01", issue: "SEC degradation", action: "Preventive maintenance", rationale: "Service wear points and compare good-component SEC before and after.", capexInr: 20000, reductionLow: .15, reductionHigh: .25, basis: "sec-excess", productionImpact: "Short planned stoppage; baseline output to be maintained", productionRisk: "Low", qualityRisk: "None expected", difficulty: "Moderate", readiness: .72 },
  { id: "wl-components", machine: "WL-01", issue: "SEC degradation", action: "Equipment inspection / component replacement", rationale: "Inspect components and replace only after the cause of SEC drift is confirmed.", capexInr: 75000, reductionLow: .25, reductionHigh: .40, basis: "sec-excess", productionImpact: "Planned downtime required; baseline output to be maintained", productionRisk: "Medium", qualityRisk: "Requires validation", difficulty: "Complex", readiness: .48 }
];
