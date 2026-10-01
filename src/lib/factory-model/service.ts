import "server-only";
import { Prisma, type Equipment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEMO_FACTORY_ID, type ModelCommand } from "@/lib/factory-model/schema";
import { ensureDemoFactory } from "@/lib/factory-model/seed";

export class ModelError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function getFactoryModel() {
  await ensureDemoFactory();
  const record = await prisma.factory.findUniqueOrThrow({
    where: { id: DEMO_FACTORY_ID },
    include: {
      areas: { orderBy: { code: "asc" } },
      productionLines: { orderBy: { code: "asc" } },
      equipment: { orderBy: { code: "asc" } },
      meters: { orderBy: { code: "asc" } },
      sensors: { orderBy: { code: "asc" } },
      electricalConnections: true,
      processConnections: true
    }
  });
  return {
    factory: { id: record.id, name: record.name, city: record.city, state: record.state, employeeCount: record.employeeCount, shiftCount: record.shiftCount, isDemo: record.isDemo },
    areas: record.areas,
    productionLines: record.productionLines,
    equipment: record.equipment,
    meters: record.meters,
    sensors: record.sensors,
    electricalConnections: record.electricalConnections,
    processConnections: record.processConnections
  };
}

async function belongsToFactory(model: "area" | "productionLine" | "meter" | "equipment", id: string | null) {
  if (!id) return;
  const found = model === "area" ? await prisma.area.findFirst({ where: { id, factoryId: DEMO_FACTORY_ID }, select: { id: true } })
    : model === "productionLine" ? await prisma.productionLine.findFirst({ where: { id, factoryId: DEMO_FACTORY_ID }, select: { id: true } })
    : model === "meter" ? await prisma.meter.findFirst({ where: { id, factoryId: DEMO_FACTORY_ID }, select: { id: true } })
    : await prisma.equipment.findFirst({ where: { id, factoryId: DEMO_FACTORY_ID }, select: { id: true } });
  if (!found) throw new ModelError(`Selected ${model} does not belong to this factory.`, 404);
}

async function equipmentOrThrow(id: string) {
  const item = await prisma.equipment.findFirst({ where: { id, factoryId: DEMO_FACTORY_ID } });
  if (!item) throw new ModelError("Equipment not found.", 404);
  return item;
}

function hasUpstreamMeter(item: Equipment, byId: Map<string, Equipment>) {
  const visited = new Set<string>();
  let parentId = item.parentFeederId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return false;
    if (parent.meterId) return true;
    parentId = parent.parentFeederId;
  }
  return false;
}

async function reconcileMetering() {
  const items = await prisma.equipment.findMany({ where: { factoryId: DEMO_FACTORY_ID } });
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    const nextMode = item.meterId ? "DIRECT_METER"
      : item.meteringMode === "DIRECT_METER" ? "INFERRED"
      : item.meteringMode === "FEEDER_METER" && !hasUpstreamMeter(item, byId) ? "INFERRED"
      : item.meteringMode;
    if (nextMode !== item.meteringMode) await prisma.equipment.update({ where: { id: item.id }, data: { meteringMode: nextMode } });
  }
}

export async function applyModelCommand(command: ModelCommand) {
  await ensureDemoFactory();
  switch (command.action) {
    case "factory.update":
      await prisma.factory.update({ where: { id: DEMO_FACTORY_ID }, data: command.data });
      break;
    case "area.save":
      if (command.id) {
        await belongsToFactory("area", command.id);
        await prisma.area.update({ where: { id: command.id }, data: command.data });
      } else await prisma.area.create({ data: { ...command.data, factoryId: DEMO_FACTORY_ID } });
      break;
    case "area.delete":
      await belongsToFactory("area", command.id);
      await prisma.area.delete({ where: { id: command.id } });
      break;
    case "line.save":
      await belongsToFactory("area", command.data.areaId);
      if (command.id) {
        await belongsToFactory("productionLine", command.id);
        await prisma.productionLine.update({ where: { id: command.id }, data: command.data });
      } else await prisma.productionLine.create({ data: { ...command.data, factoryId: DEMO_FACTORY_ID } });
      break;
    case "line.delete":
      await belongsToFactory("productionLine", command.id);
      await prisma.productionLine.delete({ where: { id: command.id } });
      break;
    case "equipment.save": {
      await belongsToFactory("area", command.data.areaId);
      await belongsToFactory("productionLine", command.data.productionLineId);
      const existing = command.id ? await equipmentOrThrow(command.id) : null;
      if (command.data.meteringMode === "DIRECT_METER" && !existing?.meterId) throw new ModelError("Assign a meter before selecting direct metering.");
      if (command.data.meteringMode === "FEEDER_METER") {
        if (!existing?.parentFeederId) throw new ModelError("Connect an upstream feeder before selecting feeder metering.");
        const all = await prisma.equipment.findMany({ where: { factoryId: DEMO_FACTORY_ID } });
        if (!hasUpstreamMeter(existing, new Map(all.map((item) => [item.id, item])))) throw new ModelError("No upstream meter is available for this equipment.");
      }
      if (existing) {
        await prisma.$transaction(async (tx) => {
          if (existing.meterId && command.data.meteringMode !== "DIRECT_METER") {
            await tx.meter.update({ where: { id: existing.meterId }, data: { measuredEquipmentOrFeeder: null } });
          }
          await tx.equipment.update({ where: { id: existing.id }, data: {
            ...command.data, meterId: command.data.meteringMode === "DIRECT_METER" ? existing.meterId : null
          } });
          if (existing.meterId && command.data.meteringMode === "DIRECT_METER") {
            await tx.meter.update({ where: { id: existing.meterId }, data: { measuredEquipmentOrFeeder: command.data.code } });
          }
        });
      } else await prisma.equipment.create({ data: { ...command.data, factoryId: DEMO_FACTORY_ID } });
      break;
    }
    case "equipment.delete": {
      const item = await equipmentOrThrow(command.id);
      const children = await prisma.equipment.count({ where: { parentFeederId: item.id } });
      if (children) throw new ModelError("Disconnect or delete downstream equipment before deleting this item.");
      await prisma.$transaction(async (tx) => {
        if (item.meterId) await tx.meter.update({ where: { id: item.meterId }, data: { measuredEquipmentOrFeeder: null } });
        await tx.equipment.delete({ where: { id: item.id } });
      });
      break;
    }
    case "meter.save":
      if (command.id) {
        await belongsToFactory("meter", command.id);
        await prisma.meter.update({ where: { id: command.id }, data: command.data });
      } else await prisma.meter.create({ data: { ...command.data, factoryId: DEMO_FACTORY_ID } });
      break;
    case "meter.delete":
      await belongsToFactory("meter", command.id);
      await prisma.meter.delete({ where: { id: command.id } });
      break;
    case "meter.assign": {
      await belongsToFactory("meter", command.meterId);
      await belongsToFactory("equipment", command.equipmentId);
      const assigned = await prisma.equipment.findFirst({ where: { meterId: command.meterId } });
      if (assigned && command.equipmentId && assigned.id !== command.equipmentId) throw new ModelError("This meter is already assigned. Unassign it before moving it.");
      await prisma.$transaction(async (tx) => {
        if (assigned) await tx.equipment.update({ where: { id: assigned.id }, data: { meterId: null, meteringMode: "INFERRED" } });
        if (command.equipmentId) {
          const target = await tx.equipment.findUniqueOrThrow({ where: { id: command.equipmentId } });
          if (target.meterId && target.meterId !== command.meterId) throw new ModelError("This equipment already has a meter. Unassign it first.");
          await tx.equipment.update({ where: { id: target.id }, data: { meterId: command.meterId, meteringMode: "DIRECT_METER" } });
          await tx.meter.update({ where: { id: command.meterId }, data: { measuredEquipmentOrFeeder: target.code } });
        } else await tx.meter.update({ where: { id: command.meterId }, data: { measuredEquipmentOrFeeder: null } });
      });
      break;
    }
    case "equipment.unmeter": {
      const item = await equipmentOrThrow(command.id);
      await prisma.$transaction(async (tx) => {
        if (item.meterId) await tx.meter.update({ where: { id: item.meterId }, data: { measuredEquipmentOrFeeder: null } });
        await tx.equipment.update({ where: { id: item.id }, data: { meterId: null, meteringMode: "UNMETERED" } });
      });
      break;
    }
    case "sensor.save":
      await belongsToFactory("equipment", command.data.equipmentId);
      if (command.id) {
        const found = await prisma.sensor.findFirst({ where: { id: command.id, factoryId: DEMO_FACTORY_ID } });
        if (!found) throw new ModelError("Sensor not found.", 404);
        await prisma.sensor.update({ where: { id: command.id }, data: command.data });
      } else await prisma.sensor.create({ data: { ...command.data, factoryId: DEMO_FACTORY_ID } });
      break;
    case "sensor.delete": {
      const found = await prisma.sensor.findFirst({ where: { id: command.id, factoryId: DEMO_FACTORY_ID } });
      if (!found) throw new ModelError("Sensor not found.", 404);
      await prisma.sensor.delete({ where: { id: command.id } });
      break;
    }
    case "connection.add": {
      const { kind, sourceEquipmentId, targetEquipmentId, connectionType, lossFactor } = command.data;
      if (sourceEquipmentId === targetEquipmentId) throw new ModelError("Equipment cannot connect to itself.");
      await belongsToFactory("equipment", sourceEquipmentId);
      await belongsToFactory("equipment", targetEquipmentId);
      if (kind === "electrical") {
        const target = await equipmentOrThrow(targetEquipmentId);
        if (target.parentFeederId) throw new ModelError("Target already has an electrical supply. Disconnect it first.");
        const source = await equipmentOrThrow(sourceEquipmentId);
        const all = await prisma.equipment.findMany({ where: { factoryId: DEMO_FACTORY_ID } });
        const byId = new Map(all.map((item) => [item.id, item]));
        let cursor: Equipment | undefined = source;
        while (cursor) {
          if (cursor.id === target.id) throw new ModelError("This connection would create an electrical cycle.");
          cursor = cursor.parentFeederId ? byId.get(cursor.parentFeederId) : undefined;
        }
        await prisma.$transaction(async (tx) => {
          await tx.electricalConnection.create({ data: { factoryId: DEMO_FACTORY_ID, sourceEquipmentId, targetEquipmentId, connectionType, lossFactor } });
          await tx.equipment.update({ where: { id: targetEquipmentId }, data: { parentFeederId: sourceEquipmentId } });
        });
      } else await prisma.processConnection.create({ data: { factoryId: DEMO_FACTORY_ID, sourceEquipmentId, targetEquipmentId, connectionType, lossFactor } });
      break;
    }
    case "connection.delete":
      if (command.kind === "electrical") {
        const existing = await prisma.electricalConnection.findFirst({ where: { id: command.id, factoryId: DEMO_FACTORY_ID } });
        if (!existing) throw new ModelError("Connection not found.", 404);
        await prisma.$transaction(async (tx) => {
          await tx.electricalConnection.delete({ where: { id: command.id } });
          await tx.equipment.update({ where: { id: existing.targetEquipmentId }, data: { parentFeederId: null } });
        });
      } else {
        const existing = await prisma.processConnection.findFirst({ where: { id: command.id, factoryId: DEMO_FACTORY_ID } });
        if (!existing) throw new ModelError("Connection not found.", 404);
        await prisma.processConnection.delete({ where: { id: command.id } });
      }
      break;
  }
  await reconcileMetering();
  return getFactoryModel();
}

export function modelErrorResponse(error: unknown) {
  if (error instanceof ModelError) return { message: error.message, status: error.status };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { message: "That code or connection already exists in this factory.", status: 409 };
    if (error.code === "P2003") return { message: "This item is still referenced by another factory record.", status: 409 };
    if (error.code === "P2025") return { message: "The selected item no longer exists.", status: 404 };
  }
  console.error("Factory model error", error);
  return { message: "Factory setup could not be saved.", status: 500 };
}
