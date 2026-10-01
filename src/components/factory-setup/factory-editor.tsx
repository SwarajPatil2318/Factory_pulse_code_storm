"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DEMO_LABEL } from "@/lib/demo";
import { equipmentTypes, meteringLabels, meteringModes, type FactoryModel, type ModelCommand } from "@/lib/factory-model/schema";

export type EditorKind = "factory" | "area" | "line" | "equipment" | "meter" | "assign" | "sensor" | "connection";
export type EditorState = { kind: EditorKind; id?: string };
type Field = { name: string; label: string; type?: "text" | "number" | "select"; required?: boolean; options?: Array<{ value: string; label: string }>; hint?: string };

const option = (value: string, label = value) => ({ value, label });
const asText = (value: unknown) => value == null ? "" : String(value);
const nullable = (value: string) => value.trim() || null;
const numeric = (value: string) => value.trim() === "" ? null : Number(value);

function fieldsFor(kind: EditorKind, model: FactoryModel, current: Record<string, unknown>): Field[] {
  const areas = [option("", "No area"), ...model.areas.map((item) => option(item.id, `${item.code} · ${item.name}`))];
  const equipment = [option("", "No equipment"), ...model.equipment.map((item) => option(item.id, `${item.code} · ${item.name}`))];
  if (kind === "factory") return [
    { name: "name", label: "Factory name", required: true }, { name: "city", label: "City", required: true },
    { name: "state", label: "State", required: true }, { name: "employeeCount", label: "Employees", type: "number" },
    { name: "shiftCount", label: "Operating shifts", type: "number" }
  ];
  if (kind === "area") return [{ name: "code", label: "Area code", required: true }, { name: "name", label: "Area name", required: true }, { name: "description", label: "Description" }];
  if (kind === "line") return [{ name: "code", label: "Line code", required: true }, { name: "name", label: "Line name", required: true }, { name: "areaId", label: "Area", type: "select", options: areas }];
  if (kind === "equipment") return [
    { name: "code", label: "Equipment code", required: true }, { name: "name", label: "Equipment name", required: true },
    { name: "equipmentType", label: "Equipment type", type: "select", options: equipmentTypes.map((item) => option(item, item === "grid" ? "Grid (external source)" : item)), required: true },
    { name: "areaId", label: "Area", type: "select", options: areas },
    { name: "productionLineId", label: "Production line", type: "select", options: [option("", "No line"), ...model.productionLines.map((item) => option(item.id, `${item.code} · ${item.name}`))] },
    { name: "manufacturer", label: "Manufacturer" }, { name: "model", label: "Model" },
    { name: "ratedPowerKw", label: "Rated power (kW)", type: "number" }, { name: "ratedCapacity", label: "Rated capacity / unit" },
    { name: "yearInstalled", label: "Year installed", type: "number" }, { name: "operatingHours", label: "Operating hours", type: "number" },
    { name: "criticality", label: "Criticality", type: "select", options: ["low", "medium", "high", "critical"].map((item) => option(item)) },
    { name: "productionMetric", label: "Production metric" },
    { name: "meteringMode", label: "Consumption basis", type: "select", options: meteringModes.map((item) => option(item, meteringLabels[item])), hint: current.meterId ? "A direct meter is assigned. Changing this will unassign it." : "Direct metering requires a meter assignment; feeder metering requires an upstream meter." },
    { name: "status", label: "Status", type: "select", options: ["active", "inactive", "planned"].map((item) => option(item)) }
  ];
  if (kind === "meter") return [
    { name: "code", label: "Meter code", required: true }, { name: "name", label: "Meter name", required: true },
    { name: "type", label: "Meter type", type: "select", options: ["main", "feeder", "equipment", "portable"].map((item) => option(item)) },
    { name: "sampleIntervalSeconds", label: "Sample interval (seconds)", type: "number" },
    { name: "activePower", label: "Active power (kW)", type: "number" }, { name: "reactivePower", label: "Reactive power (kVAr)", type: "number" },
    { name: "apparentPower", label: "Apparent power (kVA)", type: "number" }, { name: "powerFactor", label: "Power factor", type: "number" },
    { name: "voltage", label: "Voltage (V)", type: "number" }, { name: "current", label: "Current (A)", type: "number" },
    { name: "energy", label: "Energy (kWh)", type: "number" }, { name: "demand", label: "Demand (kW)", type: "number" }
  ];
  if (kind === "assign") return [{ name: "equipmentId", label: "Measured feeder or equipment", type: "select", options: [option("", "Unassigned"), ...model.equipment.filter((item) => !item.meterId || item.meterId === current.id).map((item) => option(item.id, `${item.code} · ${item.name}`))] }];
  if (kind === "sensor") return [
    { name: "code", label: "Sensor code", required: true }, { name: "name", label: "Sensor name", required: true },
    { name: "sensorType", label: "Sensor type", required: true }, { name: "unit", label: "Unit" },
    { name: "equipmentId", label: "Equipment", type: "select", options: equipment }, { name: "sampleIntervalSeconds", label: "Sample interval (seconds)", type: "number" },
    { name: "status", label: "Status", type: "select", options: ["active", "inactive", "planned"].map((item) => option(item)) }
  ];
  return [
    { name: "kind", label: "Connection class", type: "select", options: [option("electrical", "Electrical supply"), option("process", "Process flow")] },
    { name: "sourceEquipmentId", label: "Source equipment", type: "select", required: true, options: equipment },
    { name: "targetEquipmentId", label: "Target equipment", type: "select", required: true, options: equipment },
    { name: "connectionType", label: "Connection type", required: true, hint: "Examples: supply, backup, material flow" },
    { name: "lossFactor", label: "Loss factor (0–1, optional)", type: "number" }
  ];
}

function initialValues(kind: EditorKind, model: FactoryModel, id?: string): Record<string, string> {
  const item = kind === "factory" ? model.factory : kind === "area" ? model.areas.find((value) => value.id === id)
    : kind === "line" ? model.productionLines.find((value) => value.id === id)
    : kind === "equipment" ? model.equipment.find((value) => value.id === id)
    : kind === "meter" || kind === "assign" ? model.meters.find((value) => value.id === id)
    : kind === "sensor" ? model.sensors.find((value) => value.id === id) : undefined;
  const current = (item ?? {}) as Record<string, unknown>;
  const fields = fieldsFor(kind, model, current);
  const values = Object.fromEntries(fields.map((field) => [field.name, asText(current[field.name])])) as Record<string, string>;
  if (kind === "equipment" && !item) { values.equipmentType = "laser cutter"; values.criticality = "medium"; values.meteringMode = "INFERRED"; values.status = "active"; }
  if (kind === "meter" && !item) values.type = "equipment";
  if (kind === "sensor" && !item) values.status = "planned";
  if (kind === "assign") values.equipmentId = model.equipment.find((value) => value.meterId === id)?.id ?? "";
  if (kind === "connection") { values.kind = "electrical"; values.connectionType = "supply"; }
  return values;
}

function commandFor(kind: EditorKind, id: string | undefined, value: Record<string, string>): ModelCommand {
  const text = (key: string) => value[key]?.trim() ?? "";
  const opt = (key: string) => nullable(value[key] ?? "");
  const num = (key: string) => numeric(value[key] ?? "");
  if (kind === "factory") return { action: "factory.update", data: { name: text("name"), city: text("city"), state: text("state"), employeeCount: num("employeeCount"), shiftCount: num("shiftCount") } };
  if (kind === "area") return { action: "area.save", id, data: { code: text("code"), name: text("name"), description: opt("description") } };
  if (kind === "line") return { action: "line.save", id, data: { code: text("code"), name: text("name"), areaId: opt("areaId") } };
  if (kind === "equipment") return { action: "equipment.save", id, data: {
    code: text("code"), name: text("name"), equipmentType: text("equipmentType") as (typeof equipmentTypes)[number],
    areaId: opt("areaId"), productionLineId: opt("productionLineId"), manufacturer: opt("manufacturer"), model: opt("model"),
    ratedPowerKw: num("ratedPowerKw"), ratedCapacity: opt("ratedCapacity"), yearInstalled: num("yearInstalled"), operatingHours: num("operatingHours"),
    criticality: text("criticality") as "medium", productionMetric: opt("productionMetric"), meteringMode: text("meteringMode") as "INFERRED", status: text("status") as "active"
  } };
  if (kind === "meter") return { action: "meter.save", id, data: {
    code: text("code"), name: text("name"), type: text("type") as "equipment", sampleIntervalSeconds: num("sampleIntervalSeconds"),
    activePower: num("activePower"), reactivePower: num("reactivePower"), apparentPower: num("apparentPower"), powerFactor: num("powerFactor"),
    voltage: num("voltage"), current: num("current"), energy: num("energy"), demand: num("demand")
  } };
  if (kind === "assign") return { action: "meter.assign", meterId: id!, equipmentId: opt("equipmentId") };
  if (kind === "sensor") return { action: "sensor.save", id, data: {
    code: text("code"), name: text("name"), sensorType: text("sensorType"), unit: opt("unit"), equipmentId: opt("equipmentId"), sampleIntervalSeconds: num("sampleIntervalSeconds"), status: text("status") as "planned"
  } };
  return { action: "connection.add", data: {
    kind: text("kind") as "electrical", sourceEquipmentId: text("sourceEquipmentId"), targetEquipmentId: text("targetEquipmentId"),
    connectionType: text("connectionType"), lossFactor: num("lossFactor")
  } };
}

export function FactoryEditor({ editor, model, busy, error, onClose, onSave }: { editor: EditorState; model: FactoryModel; busy: boolean; error: string | null; onClose: () => void; onSave: (command: ModelCommand) => void }) {
  const [values, setValues] = useState(() => initialValues(editor.kind, model, editor.id));
  const item = editor.kind === "equipment" ? model.equipment.find((value) => value.id === editor.id) : model.meters.find((value) => value.id === editor.id);
  const title = editor.kind === "assign" ? "Assign meter" : editor.kind === "connection" ? "Connect equipment" : editor.kind === "factory" ? "Edit factory profile" : `${editor.id ? "Edit" : "Add"} ${editor.kind}`;
  const fields = fieldsFor(editor.kind, model, (item ?? {}) as Record<string, unknown>);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18251e]/45 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[min(92vh,900px)] w-full max-w-[750px] overflow-y-auto rounded-xl border border-[#d9e3dc] bg-white shadow-[0_18px_60px_rgba(18,33,23,.18)]">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e8eee9] bg-white px-5 py-4 sm:px-6"><div><h2 className="text-base font-semibold text-[#27372d]">{title}</h2><p className="mt-0.5 text-xs text-[#849188]">{DEMO_LABEL}</p></div><button className="rounded-md px-2 py-1 text-xl text-[#6f7d73] hover:bg-[#f0f4f1]" onClick={onClose} aria-label="Close dialog">×</button></div>
      <form onSubmit={(event) => { event.preventDefault(); onSave(commandFor(editor.kind, editor.id, values)); }} className="p-5 sm:p-6">
        {error && <div role="alert" className="mb-5 rounded-lg border border-[#f0d6c5] bg-[#fff8f0] px-4 py-3 text-sm text-[#9a572e]">{error}</div>}
        {editor.kind === "equipment" && item && <p className="mb-5 rounded-lg border border-[#e2e9e4] bg-[#f8faf9] px-4 py-3 text-xs text-[#64746a]">Electrical parent: <strong>{model.equipment.find((value) => value.id === (item as FactoryModel["equipment"][number]).parentFeederId)?.code ?? "None"}</strong>. Change this in Connections. Assigned meter: <strong>{model.meters.find((value) => value.id === (item as FactoryModel["equipment"][number]).meterId)?.code ?? "None"}</strong>.</p>}
        {editor.kind === "meter" && <p className="mb-5 rounded-lg border border-[#e2e9e4] bg-[#f8faf9] px-4 py-3 text-xs text-[#64746a]">Reading fields are optional. Leave them empty when no measured data is available.</p>}
        <div className="grid gap-4 sm:grid-cols-2">{fields.map((field) => <label key={field.name} className="block text-xs font-semibold text-[#526359]">{field.label}{field.required && <span className="ml-1 text-[#a36a18]">*</span>}
          {field.type === "select" ? <select required={field.required} value={values[field.name] ?? ""} onChange={(event) => setValues((old) => ({ ...old, [field.name]: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border border-[#dce5df] bg-white px-3 text-sm font-normal text-[#2c3c31] outline-none focus:border-[#7ca58b]"><option value="" disabled={field.required}>Select...</option>{field.options?.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select>
          : <input required={field.required} type={field.type === "number" ? "number" : "text"} step={field.type === "number" ? "any" : undefined} min={field.type === "number" ? 0 : undefined} value={values[field.name] ?? ""} onChange={(event) => setValues((old) => ({ ...old, [field.name]: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border border-[#dce5df] bg-white px-3 text-sm font-normal text-[#2c3c31] outline-none focus:border-[#7ca58b]" />}
          {field.hint && <span className="mt-1 block text-[11px] font-normal leading-4 text-[#87948a]">{field.hint}</span>}
        </label>)}</div>
        <div className="mt-7 flex justify-end gap-2 border-t border-[#edf1ee] pt-5"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : editor.kind === "connection" ? "Connect" : "Save changes"}</Button></div>
      </form>
    </div>
  </div>;
}
