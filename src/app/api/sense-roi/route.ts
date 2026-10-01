import { NextResponse } from "next/server";
import { getSenseRoi } from "@/lib/sense-roi/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(await getSenseRoi()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "SenseROI unavailable" }, { status: 500 }); }
}
