import { NextResponse } from "next/server";
import { getMachineStateDiagnostics } from "@/lib/machine-state/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getMachineStateDiagnostics(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Machine-state diagnostics unavailable" }, { status: 500 });
  }
}
