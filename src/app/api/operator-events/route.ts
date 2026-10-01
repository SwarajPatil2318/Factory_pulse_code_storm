import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DEMO_FACTORY_ID } from "@/lib/factory-model/schema";
import { OPERATOR_CATEGORIES, type OperatorCategory } from "@/lib/operator-intelligence/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const categoryCodes = OPERATOR_CATEGORIES.map((item) => item.code) as [OperatorCategory, ...OperatorCategory[]];
const eventSchema = z.object({
  equipmentId: z.string().min(1),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  reasonCode: z.enum(categoryCodes),
  note: z.string().trim().max(500).optional().nullable()
}).refine((value) => new Date(value.endAt) > new Date(value.startAt), { path: ["endAt"], message: "End time must be after start time." })
  .refine((value) => new Date(value.endAt).getTime() - new Date(value.startAt).getTime() <= 12 * 3_600_000, { path: ["endAt"], message: "An event may span at most 12 hours." });

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid event." }, { status: 400 });
  try {
    const run = await prisma.simulationRun.findFirst({ where: { factoryId: DEMO_FACTORY_ID, active: true }, orderBy: { generatedAt: "desc" } });
    if (!run) return NextResponse.json({ error: "Generate the demo history before logging events." }, { status: 503 });
    const item = await prisma.equipment.findFirst({ where: { id: parsed.data.equipmentId, factoryId: DEMO_FACTORY_ID, status: "active" } });
    if (!item || ["grid", "transformer", "main incomer", "distribution panel"].includes(item.equipmentType)) return NextResponse.json({ error: "Choose an active machine." }, { status: 400 });
    const startAt = new Date(parsed.data.startAt);
    const endAt = new Date(parsed.data.endAt);
    if (startAt < run.startAt || endAt > run.endAt) return NextResponse.json({ error: "Choose a time within the generated 30-day demo history." }, { status: 400 });
    const event = await prisma.operatorEvent.create({ data: { runId: run.id, equipmentId: item.id, startAt, endAt, reasonCode: parsed.data.reasonCode, note: parsed.data.note || null, source: "DEMO_ENTRY" } });
    return NextResponse.json({ event: { ...event, machineCode: item.code }, source: "SIMULATED", disclaimer: "Demo / simulated data. This event belongs to the fictional factory." }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save operator event." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
  const event = await prisma.operatorEvent.findFirst({ where: { id, source: "DEMO_ENTRY", run: { factoryId: DEMO_FACTORY_ID, active: true } } });
  if (!event) return NextResponse.json({ error: "Editable demo event not found." }, { status: 404 });
  await prisma.operatorEvent.delete({ where: { id } });
  return NextResponse.json({ deleted: true, source: "SIMULATED" });
}
