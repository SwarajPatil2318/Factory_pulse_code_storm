import { assumptions, type SimJob, type SimModel } from "./generator";

export type GeneratedOperatorEvent = { equipmentId: string; startAt: Date; endAt: Date; reasonCode: string; note: string; source: "SIMULATED" };
export type GeneratedMachineSignal = { equipmentId: string; startAt: Date; endAt: Date; state: string; source: "SIMULATED_PLC" };
const minutes = (date: Date, amount: number) => new Date(date.getTime() + amount * 60_000);

/** Fictional contextual inputs, independent of the interpretation results. */
export function generateOperatorContext(model: SimModel, jobs: SimJob[], day: Date, dayIndex: number) {
  const equipment = new Map(model.equipment.map((item) => [item.code, item]));
  const events: GeneratedOperatorEvent[] = [];
  const signals: GeneratedMachineSignal[] = [];
  const add = (code: string, startAt: Date, endAt: Date, reasonCode: string, note: string) => {
    const item = equipment.get(code);
    if (item && item.status === "active" && endAt > startAt) events.push({ equipmentId: item.id, startAt, endAt, reasonCode, note, source: "SIMULATED" });
  };
  for (const code of ["LC-01", "LC-02"]) {
    const machineJobs = jobs.filter((job) => job.equipmentId === equipment.get(code)?.id).sort((a, b) => a.actualStart.getTime() - b.actualStart.getTime());
    for (const job of machineJobs) {
      add(code, minutes(job.actualStart, -10), job.actualStart, "TOOL_SETUP", "Tool and program setup before the scheduled cutting job.");
      add(code, job.actualEnd, minutes(job.actualEnd, 10), "LOADING_UNLOADING", "Part removal and next-sheet loading.");
    }
    for (const shift of assumptions.shifts) {
      const last = machineJobs.filter((job) => job.shift === shift.name).at(-1);
      if (last) add(code, minutes(last.actualEnd, 10), minutes(last.actualEnd, 20), "MANDATED_COOLING", "Scheduled cooling interval after the final cutting job.");
    }
    if (dayIndex % 7 === 4) for (const shift of assumptions.shifts) {
      const startAt = minutes(day, shift.endMinute - 30);
      add(code, startAt, minutes(startAt, 15), "SCHEDULED_INSPECTION", "Scheduled optics and safety inspection.");
    }
    if (dayIndex % 5 === 2) for (const shift of assumptions.shifts) {
      const shiftJobs = machineJobs.filter((job) => job.shift === shift.name);
      if (shiftJobs.length > 1) add(code, minutes(shiftJobs[0].actualEnd, 10), minutes(shiftJobs[1].actualStart, -10), "WAITING_FOR_MATERIAL", "Operator log: next material lot has not reached the machine.");
    }
  }
  for (const shift of assumptions.shifts) {
    const lc = equipment.get("LC-01");
    if (lc) signals.push({ equipmentId: lc.id, startAt: minutes(day, shift.startMinute), endAt: minutes(day, shift.startMinute + 10), state: "SETUP", source: "SIMULATED_PLC" });
  }
  if (dayIndex % 4 === 1) add("AC-01", minutes(day, 750), minutes(day, 780), "LUNCH_STANDBY", "Operator log: compressor left energized during lunch handover.");
  return { events, signals };
}
