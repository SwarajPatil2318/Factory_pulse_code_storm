import { NextResponse } from "next/server";
import { getVerificationDemo } from "@/lib/verification/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(await getVerificationDemo()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Verification unavailable" }, { status: 500 }); }
}
