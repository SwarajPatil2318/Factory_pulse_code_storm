import { prisma } from "@/lib/prisma";
import { DEMO_FACTORY_ID } from "@/lib/factory-model/schema";

/** Creates the fictional factory once. Later edits and deletions remain untouched. */
export async function ensureDemoFactory() {
  const existing = await prisma.factory.findUnique({ where: { id: DEMO_FACTORY_ID }, select: { id: true } });
  if (existing) return;

  await prisma.$transaction(async (tx) => {
    await tx.factory.create({ data: {
      id: DEMO_FACTORY_ID, name: "Pragati AutoFab Pvt. Ltd.", city: "Nashik", state: "Maharashtra",
      employeeCount: 120, shiftCount: 2, isDemo: true
    } });

    const areas = [
      { id: "area-power", code: "POWER", name: "Incoming power" },
      { id: "area-production", code: "PROD", name: "Production" },
      { id: "area-utilities", code: "UTIL", name: "Utilities" },
      { id: "area-facility", code: "FAC", name: "Facility" }
    ];
    for (const area of areas) await tx.area.create({ data: { ...area, factoryId: DEMO_FACTORY_ID } });

    await tx.productionLine.create({ data: {
      id: "line-auto-components", factoryId: DEMO_FACTORY_ID, areaId: "area-production",
      code: "LINE-01", name: "Automotive components line"
    } });

    const meters = [
      { id: "meter-main", code: "EM-MAIN", name: "Main incomer meter", type: "main", measuredEquipmentOrFeeder: "M-01" },
      { id: "meter-pf", code: "FM-PF-01", name: "Production feeder meter", type: "feeder", measuredEquipmentOrFeeder: "PF-01" },
      { id: "meter-uf", code: "FM-UF-01", name: "Utilities feeder meter", type: "feeder", measuredEquipmentOrFeeder: "UF-01" },
      { id: "meter-lc01", code: "EM-LC-01", name: "Laser cutter LC-01 meter", type: "equipment", measuredEquipmentOrFeeder: "LC-01" },
      { id: "meter-ac01", code: "EM-AC-01", name: "Air compressor AC-01 meter", type: "equipment", measuredEquipmentOrFeeder: "AC-01" }
    ];
    for (const meter of meters) await tx.meter.create({ data: { ...meter, factoryId: DEMO_FACTORY_ID } });

    const equipment: Array<{
      id: string; code: string; name: string; equipmentType: string; areaId: string;
      parentFeederId?: string; meterId?: string; meteringMode: string; productionLineId?: string;
    }> = [
      { id: "eq-grid", code: "GRID", name: "Grid", equipmentType: "grid", areaId: "area-power", meteringMode: "UNMETERED" },
      { id: "eq-tr01", code: "TR-01", name: "Main Transformer TR-01", equipmentType: "transformer", areaId: "area-power", parentFeederId: "eq-grid", meteringMode: "INFERRED" },
      { id: "eq-m01", code: "M-01", name: "Main Incomer M-01", equipmentType: "main incomer", areaId: "area-power", parentFeederId: "eq-tr01", meterId: "meter-main", meteringMode: "DIRECT_METER" },
      { id: "eq-mdb01", code: "MDB-01", name: "Main Distribution Panel MDB-01", equipmentType: "distribution panel", areaId: "area-power", parentFeederId: "eq-m01", meteringMode: "FEEDER_METER" },
      { id: "eq-pf01", code: "PF-01", name: "Production Feeder PF-01", equipmentType: "distribution panel", areaId: "area-production", parentFeederId: "eq-mdb01", meterId: "meter-pf", meteringMode: "DIRECT_METER" },
      { id: "eq-uf01", code: "UF-01", name: "Utilities Feeder UF-01", equipmentType: "distribution panel", areaId: "area-utilities", parentFeederId: "eq-mdb01", meterId: "meter-uf", meteringMode: "DIRECT_METER" },
      { id: "eq-ff01", code: "FF-01", name: "Facility Feeder FF-01", equipmentType: "distribution panel", areaId: "area-facility", parentFeederId: "eq-mdb01", meteringMode: "INFERRED" },
      { id: "eq-lc01", code: "LC-01", name: "Laser Cutter LC-01", equipmentType: "laser cutter", areaId: "area-production", parentFeederId: "eq-pf01", meterId: "meter-lc01", meteringMode: "DIRECT_METER", productionLineId: "line-auto-components" },
      { id: "eq-lc02", code: "LC-02", name: "Laser Cutter LC-02", equipmentType: "laser cutter", areaId: "area-production", parentFeederId: "eq-pf01", meteringMode: "FEEDER_METER", productionLineId: "line-auto-components" },
      { id: "eq-pb01", code: "PB-01", name: "Press Brake PB-01", equipmentType: "CNC press brake", areaId: "area-production", parentFeederId: "eq-pf01", meteringMode: "FEEDER_METER", productionLineId: "line-auto-components" },
      { id: "eq-wl01", code: "WL-01", name: "Welding Line WL-01", equipmentType: "welding line", areaId: "area-production", parentFeederId: "eq-pf01", meteringMode: "FEEDER_METER", productionLineId: "line-auto-components" },
      { id: "eq-pc01", code: "PC-01", name: "Powder Coating PC-01", equipmentType: "powder coating oven", areaId: "area-production", parentFeederId: "eq-pf01", meteringMode: "FEEDER_METER", productionLineId: "line-auto-components" },
      { id: "eq-as01", code: "AS-01", name: "Assembly Line AS-01", equipmentType: "assembly line", areaId: "area-production", parentFeederId: "eq-pf01", meteringMode: "FEEDER_METER", productionLineId: "line-auto-components" },
      { id: "eq-ac01", code: "AC-01", name: "Air Compressor AC-01", equipmentType: "air compressor", areaId: "area-utilities", parentFeederId: "eq-uf01", meterId: "meter-ac01", meteringMode: "DIRECT_METER" },
      { id: "eq-cp01", code: "CP-01", name: "Cooling Pump CP-01", equipmentType: "cooling pump", areaId: "area-utilities", parentFeederId: "eq-uf01", meteringMode: "FEEDER_METER" },
      { id: "eq-lighting", code: "LIGHTING", name: "Lighting", equipmentType: "lighting", areaId: "area-facility", parentFeederId: "eq-ff01", meteringMode: "INFERRED" },
      { id: "eq-office", code: "OFFICE", name: "Office / General Loads", equipmentType: "general utility", areaId: "area-facility", parentFeederId: "eq-ff01", meteringMode: "UNMETERED" }
    ];
    for (const item of equipment) await tx.equipment.create({ data: { ...item, factoryId: DEMO_FACTORY_ID } });

    for (const item of equipment) {
      if (!item.parentFeederId) continue;
      await tx.electricalConnection.create({ data: {
        factoryId: DEMO_FACTORY_ID, sourceEquipmentId: item.parentFeederId,
        targetEquipmentId: item.id, connectionType: "supply"
      } });
    }
  });
}
