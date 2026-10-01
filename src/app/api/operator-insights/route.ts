import { NextResponse } from "next/server";
import { getOperatorInsights } from "@/lib/operator-intelligence/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getOperatorInsights(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Operator insights unavailable" }, { status: 500 });
  }
}
