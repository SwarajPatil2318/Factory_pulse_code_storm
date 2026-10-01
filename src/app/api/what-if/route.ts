import { NextResponse } from "next/server";
import { getWhatIfBaseline } from "@/lib/what-if/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(await getWhatIfBaseline()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "What-If baseline unavailable" }, { status: 500 }); }
}
