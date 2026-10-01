export const OPERATOR_CATEGORIES = [
  { code: "MATERIAL_UNAVAILABLE", label: "Material unavailable", group: "Material waiting" },
  { code: "SETUP_CHANGEOVER", label: "Setup / changeover", group: "Setup & changeover" },
  { code: "TOOL_CHANGE", label: "Tool change", group: "Setup & changeover" },
  { code: "QUALITY_INSPECTION", label: "Quality inspection", group: "Quality & inspection" },
  { code: "MACHINE_FAULT", label: "Machine fault", group: "Downtime" },
  { code: "MAINTENANCE", label: "Maintenance", group: "Downtime" },
  { code: "WAITING_DOWNSTREAM", label: "Waiting for downstream process", group: "Scheduling & handoffs" },
  { code: "WAITING_UPSTREAM", label: "Waiting for upstream process", group: "Scheduling & handoffs" },
  { code: "LUNCH_SHIFT_BREAK", label: "Lunch / shift break", group: "Breaks & staffing" },
  { code: "OPERATOR_UNAVAILABLE", label: "Operator unavailable", group: "Breaks & staffing" },
  { code: "UTILITY_ISSUE", label: "Utility issue", group: "Utility" },
  { code: "OTHER", label: "Other", group: "Other / unexplained" }
] as const;
export type OperatorCategory = typeof OPERATOR_CATEGORIES[number]["code"];

const generatedReasonMap: Record<string, OperatorCategory | "SCHEDULING_GAP" | "AFTER_SHIFT"> = {
  WAITING_FOR_MATERIAL: "MATERIAL_UNAVAILABLE", MATERIAL_WAIT: "MATERIAL_UNAVAILABLE", TOOL_SETUP: "SETUP_CHANGEOVER",
  LOADING_UNLOADING: "SETUP_CHANGEOVER", SCHEDULED_INSPECTION: "QUALITY_INSPECTION",
  MANDATED_COOLING: "MAINTENANCE", LUNCH_STANDBY: "LUNCH_SHIFT_BREAK",
  UPSTREAM_DELAY: "WAITING_UPSTREAM", DOWNSTREAM_DELAY: "WAITING_DOWNSTREAM",
  JOB_SCHEDULING_GAP: "SCHEDULING_GAP", LEFT_ENERGIZED_AFTER_SHIFT: "AFTER_SHIFT",
  FAULT: "MACHINE_FAULT"
};
export function normalizedCause(reasonCode: string | null) {
  if (!reasonCode) return "OTHER";
  if (OPERATOR_CATEGORIES.some((item) => item.code === reasonCode)) return reasonCode as OperatorCategory;
  return generatedReasonMap[reasonCode] ?? "OTHER";
}
export function causeLabel(reasonCode: string | null) {
  const code = normalizedCause(reasonCode);
  if (code === "SCHEDULING_GAP") return "Job scheduling gap";
  if (code === "AFTER_SHIFT") return "Left energized after shift";
  return OPERATOR_CATEGORIES.find((item) => item.code === code)?.label ?? "Other";
}
export function causeGroup(reasonCode: string | null) {
  const code = normalizedCause(reasonCode);
  if (code === "SCHEDULING_GAP") return "Scheduling & handoffs";
  if (code === "AFTER_SHIFT") return "Breaks & staffing";
  return OPERATOR_CATEGORIES.find((item) => item.code === code)?.group ?? "Other / unexplained";
}
export function recommendationForReason(reasonCode: string | null) {
  switch (normalizedCause(reasonCode)) {
    case "MATERIAL_UNAVAILABLE": return "Improve material staging before job completion.";
    case "SETUP_CHANGEOVER": return "Prepare tooling, program and changeover kit before the current job ends.";
    case "TOOL_CHANGE": return "Prepare replacement tools and standardize the tool-change sequence.";
    case "QUALITY_INSPECTION": return "Confirm inspection timing; keep mandated checks while reducing machine-on waiting where permitted.";
    case "MACHINE_FAULT": return "Review the fault code and schedule corrective maintenance before the next shift.";
    case "MAINTENANCE": return "Confirm the maintenance window and power-down procedure before changing operation.";
    case "WAITING_DOWNSTREAM": return "Align downstream capacity and handoff timing with machine completion.";
    case "WAITING_UPSTREAM": return "Release upstream work in time for the next planned machine job.";
    case "LUNCH_SHIFT_BREAK": return "Use a shift-break standby or power-down checklist where process rules allow.";
    case "OPERATOR_UNAVAILABLE": return "Align operator coverage with planned job start and handover times.";
    case "UTILITY_ISSUE": return "Investigate the utility interruption and its effect on machine availability.";
    case "SCHEDULING_GAP": return "Sequence the next job before the current one finishes and verify material readiness.";
    case "AFTER_SHIFT": return "Add an end-of-shift machine power-down check where process rules permit.";
    default: return "Ask the operator to confirm the cause before proposing a machine action.";
  }
}
export function eventDiagnosis(reasonCode: string, durationMinutes: number, observedIdleMinutes: number) {
  if (observedIdleMinutes <= 0) return "Event logged; no energized idle matched this period";
  const attributedMinutes = observedIdleMinutes >= durationMinutes * 0.8 ? durationMinutes : observedIdleMinutes;
  const duration = `${Math.round(attributedMinutes)}-minute`;
  switch (normalizedCause(reasonCode)) {
    case "MATERIAL_UNAVAILABLE": return `${duration} material-staging delay`;
    case "SETUP_CHANGEOVER": return `${duration} setup / changeover period`;
    case "TOOL_CHANGE": return `${duration} tool-change period`;
    case "QUALITY_INSPECTION": return `${duration} quality-inspection period`;
    case "MACHINE_FAULT": return `${duration} machine-fault period`;
    case "MAINTENANCE": return `${duration} maintenance period`;
    case "WAITING_DOWNSTREAM": return `${duration} downstream handoff delay`;
    case "WAITING_UPSTREAM": return `${duration} upstream handoff delay`;
    case "LUNCH_SHIFT_BREAK": return `${duration} shift-break standby period`;
    case "OPERATOR_UNAVAILABLE": return `${duration} operator-coverage delay`;
    case "UTILITY_ISSUE": return `${duration} utility disruption`;
    default: return `${duration} operator-reported idle period`;
  }
}
