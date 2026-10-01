import { NextResponse } from "next/server";
import { getProductionEnergyModel } from "@/lib/production-energy/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getProductionEnergyModel(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Production energy model unavailable" }, { status: 500 });
  }
}
