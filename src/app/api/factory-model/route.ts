import { NextResponse } from "next/server";
import { modelCommandSchema } from "@/lib/factory-model/schema";
import { applyModelCommand, getFactoryModel, modelErrorResponse } from "@/lib/factory-model/service";

export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json(await getFactoryModel()); }
  catch (error) { const result = modelErrorResponse(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 }); }
  const parsed = modelCommandSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the entered fields and try again.", details: parsed.error.flatten() }, { status: 400 });
  try { return NextResponse.json(await applyModelCommand(parsed.data)); }
  catch (error) { const result = modelErrorResponse(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
