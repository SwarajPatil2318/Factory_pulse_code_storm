import { NextResponse } from "next/server";
import { getFactoryModel, modelErrorResponse } from "@/lib/factory-model/service";
import { simulateEnergyMap } from "@/lib/energy-map/simulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const model = await getFactoryModel();
    return NextResponse.json(await simulateEnergyMap(model), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = modelErrorResponse(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
