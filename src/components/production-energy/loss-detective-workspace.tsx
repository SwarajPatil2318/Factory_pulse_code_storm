"use client";

import { useState } from "react";
import { ProductionEnergyModel } from "@/components/production-energy/production-energy-model";
import { MachineStateDashboard } from "@/components/machine-state/machine-state-dashboard";

export function LossDetectiveWorkspace() {
  const [tab, setTab] = useState<"production" | "states">("production");
  return <div className="space-y-5"><div className="inline-flex rounded-lg border border-[#dce7df] bg-[#f7faf8] p-1" role="tablist" aria-label="Loss Detective views"><button role="tab" aria-selected={tab === "production"} onClick={() => setTab("production")} className={`rounded-md px-4 py-2 text-xs font-semibold ${tab === "production" ? "bg-white text-[#28664a] shadow-[0_1px_2px_rgba(30,55,39,.08)]" : "text-[#748477]"}`}>Production-aware energy</button><button role="tab" aria-selected={tab === "states"} onClick={() => setTab("states")} className={`rounded-md px-4 py-2 text-xs font-semibold ${tab === "states" ? "bg-white text-[#28664a] shadow-[0_1px_2px_rgba(30,55,39,.08)]" : "text-[#748477]"}`}>Machine states & idle</button></div>{tab === "production" ? <ProductionEnergyModel /> : <MachineStateDashboard />}</div>;
}
