import { z } from "zod";

export const DEMO_LABEL = "Demo / simulated data";

export const factoryProfileSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  employeeCount: z.number().int().positive(),
  shiftCount: z.number().int().positive(),
  processes: z.array(z.string().min(1))
});

export const demoFactory = factoryProfileSchema.parse({
  name: "Pragati AutoFab Pvt. Ltd.",
  location: "Nashik, Maharashtra",
  employeeCount: 120,
  shiftCount: 2,
  processes: ["Laser cutting", "CNC bending", "Welding", "Compressed air", "Powder coating", "Cooling water pumps", "Assembly", "General utilities"]
});
