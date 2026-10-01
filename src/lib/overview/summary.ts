import type { Opportunity } from "@/lib/decision-engine/calculation";

/** The portfolio counts one feasible action per machine; alternatives must never be added together. */
export function summarizeOpportunities(ranked: Opportunity[]) {
  const eligible = ranked.filter((item) => item.eligible);
  const seen = new Set<string>();
  const byMachine = eligible.filter((item) => {
    if (seen.has(item.machine)) return false;
    seen.add(item.machine);
    return true;
  });
  return {
    best: eligible[0] ?? null,
    topThree: byMachine.slice(0, 3),
    identifiedAnnualInr: byMachine.reduce((sum, item) => sum + item.annualRupeeSaving, 0),
    largestAnnual: [...byMachine].sort((a, b) => b.annualRupeeSaving - a.annualRupeeSaving)[0] ?? null
  };
}
