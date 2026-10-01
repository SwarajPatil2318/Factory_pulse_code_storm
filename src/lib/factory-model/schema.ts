import { z } from "zod";

export const DEMO_FACTORY_ID = "pragati-autofab";

export const equipmentTypes = [
  "grid", "transformer", "main incomer", "distribution panel", "laser cutter",
  "CNC press brake", "welding line", "air compressor", "powder coating oven",
  "cooling pump", "assembly line", "HVAC", "lighting", "general utility"
] as const;
export const meteringModes = ["DIRECT_METER", "FEEDER_METER", "INFERRED", "UNMETERED"] as const;
export const meteringLabels: Record<(typeof meteringModes)[number], string> = {
  DIRECT_METER: "Direct meter",
  FEEDER_METER: "Feeder meter only",
  INFERRED: "Inferred consumption",
  UNMETERED: "Unmetered"
};

const requiredText = z.string().trim().min(1).max(160);
const optionalText = z.string().trim().max(160).nullable();
const optionalNumber = z.number().finite().min(0).nullable();
const optionalId = z.string().min(1).nullable();

export const factoryInputSchema = z.object({
  name: requiredText,
  city: requiredText,
  state: requiredText,
  employeeCount: z.number().int().positive().nullable(),
  shiftCount: z.number().int().positive().nullable()
});
export const areaInputSchema = z.object({ code: requiredText, name: requiredText, description: optionalText });
export const lineInputSchema = z.object({ code: requiredText, name: requiredText, areaId: optionalId });
export const equipmentInputSchema = z.object({
  code: requiredText,
  name: requiredText,
  equipmentType: z.enum(equipmentTypes),
  areaId: optionalId,
  productionLineId: optionalId,
  manufacturer: optionalText,
  model: optionalText,
  ratedPowerKw: optionalNumber,
  ratedCapacity: optionalText,
  yearInstalled: z.number().int().min(1900).max(2100).nullable(),
  operatingHours: optionalNumber,
  criticality: z.enum(["low", "medium", "high", "critical"]),
  productionMetric: optionalText,
  meteringMode: z.enum(meteringModes),
  status: z.enum(["active", "inactive", "planned"])
});
export const meterInputSchema = z.object({
  code: requiredText,
  name: requiredText,
  type: z.enum(["main", "feeder", "equipment", "portable"]),
  sampleIntervalSeconds: z.number().int().positive().nullable(),
  activePower: optionalNumber,
  reactivePower: optionalNumber,
  apparentPower: optionalNumber,
  powerFactor: z.number().min(0).max(1).nullable(),
  voltage: optionalNumber,
  current: optionalNumber,
  energy: optionalNumber,
  demand: optionalNumber
});
export const sensorInputSchema = z.object({
  code: requiredText,
  name: requiredText,
  sensorType: requiredText,
  unit: optionalText,
  equipmentId: optionalId,
  sampleIntervalSeconds: z.number().int().positive().nullable(),
  status: z.enum(["active", "inactive", "planned"])
});
export const connectionInputSchema = z.object({
  kind: z.enum(["electrical", "process"]),
  sourceEquipmentId: requiredText,
  targetEquipmentId: requiredText,
  connectionType: requiredText,
  lossFactor: z.number().min(0).max(1).nullable()
});

export const modelCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("factory.update"), data: factoryInputSchema }),
  z.object({ action: z.literal("area.save"), id: z.string().optional(), data: areaInputSchema }),
  z.object({ action: z.literal("area.delete"), id: requiredText }),
  z.object({ action: z.literal("line.save"), id: z.string().optional(), data: lineInputSchema }),
  z.object({ action: z.literal("line.delete"), id: requiredText }),
  z.object({ action: z.literal("equipment.save"), id: z.string().optional(), data: equipmentInputSchema }),
  z.object({ action: z.literal("equipment.delete"), id: requiredText }),
  z.object({ action: z.literal("meter.save"), id: z.string().optional(), data: meterInputSchema }),
  z.object({ action: z.literal("meter.delete"), id: requiredText }),
  z.object({ action: z.literal("meter.assign"), meterId: requiredText, equipmentId: optionalId }),
  z.object({ action: z.literal("equipment.unmeter"), id: requiredText }),
  z.object({ action: z.literal("sensor.save"), id: z.string().optional(), data: sensorInputSchema }),
  z.object({ action: z.literal("sensor.delete"), id: requiredText }),
  z.object({ action: z.literal("connection.add"), data: connectionInputSchema }),
  z.object({ action: z.literal("connection.delete"), id: requiredText, kind: z.enum(["electrical", "process"]) })
]);

export type EquipmentInput = z.infer<typeof equipmentInputSchema>;
export type MeterInput = z.infer<typeof meterInputSchema>;
export type ModelCommand = z.infer<typeof modelCommandSchema>;

export type FactoryModel = {
  factory: { id: string; name: string; city: string; state: string; employeeCount: number | null; shiftCount: number | null; isDemo: boolean };
  areas: Array<{ id: string; code: string; name: string; description: string | null }>;
  productionLines: Array<{ id: string; code: string; name: string; areaId: string | null }>;
  equipment: Array<{
    id: string; code: string; name: string; equipmentType: string; areaId: string | null; productionLineId: string | null;
    manufacturer: string | null; model: string | null; ratedPowerKw: number | null; ratedCapacity: string | null;
    yearInstalled: number | null; operatingHours: number | null; criticality: string; productionMetric: string | null;
    parentFeederId: string | null; meterId: string | null; meteringMode: (typeof meteringModes)[number]; status: string;
  }>;
  meters: Array<{
    id: string; code: string; name: string; type: string; measuredEquipmentOrFeeder: string | null;
    sampleIntervalSeconds: number | null; activePower: number | null; reactivePower: number | null;
    apparentPower: number | null; powerFactor: number | null; voltage: number | null; current: number | null;
    energy: number | null; demand: number | null;
  }>;
  sensors: Array<{ id: string; code: string; name: string; sensorType: string; unit: string | null; equipmentId: string | null; sampleIntervalSeconds: number | null; status: string }>;
  electricalConnections: Array<{ id: string; sourceEquipmentId: string; targetEquipmentId: string; connectionType: string; lossFactor: number | null }>;
  processConnections: Array<{ id: string; sourceEquipmentId: string; targetEquipmentId: string; connectionType: string; lossFactor: number | null }>;
};
