import { NextResponse } from "next/server";
import { getDecisionEvidence } from "@/lib/decision-engine/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ source: "SIMULATED", evidence: await getDecisionEvidence() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Decision evidence unavailable" }, { status: 500 });
  }
}
