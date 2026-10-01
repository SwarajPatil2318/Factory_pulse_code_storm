"use client";

import { create } from "zustand";
import { z } from "zod";
import { format } from "date-fns";
import { demoFactory } from "@/lib/demo";

const shiftSchema = z.enum(["Shift 1", "Shift 2"]);
type Shift = z.infer<typeof shiftSchema>;

type WorkspaceState = {
  selectedDate: string;
  shift: Shift;
  mobileNavOpen: boolean;
  factoryName: string;
  factoryLocation: string;
  factoryEmployeeCount: number | null;
  factoryShiftCount: number | null;
  setSelectedDate: (value: string) => void;
  setShift: (value: string) => void;
  setMobileNavOpen: (value: boolean) => void;
  setFactoryProfile: (value: { name: string; city: string; state: string; employeeCount: number | null; shiftCount: number | null }) => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedDate: format(new Date(), "yyyy-MM-dd"),
  shift: "Shift 1",
  mobileNavOpen: false,
  factoryName: demoFactory.name,
  factoryLocation: demoFactory.location,
  factoryEmployeeCount: demoFactory.employeeCount,
  factoryShiftCount: demoFactory.shiftCount,
  setSelectedDate: (value) => {
    if (z.iso.date().safeParse(value).success) set({ selectedDate: value });
  },
  setShift: (value) => {
    const result = shiftSchema.safeParse(value);
    if (result.success) set({ shift: result.data });
  },
  setMobileNavOpen: (value) => set({ mobileNavOpen: value }),
  setFactoryProfile: (value) => set({ factoryName: value.name, factoryLocation: `${value.city}, ${value.state}`, factoryEmployeeCount: value.employeeCount, factoryShiftCount: value.shiftCount })
}));
