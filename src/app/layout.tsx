import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "FactoryPulse | Industrial Energy Decision Intelligence",
  description: "FactoryPulse demo workspace for Pragati AutoFab Pvt. Ltd., a fictional manufacturing SME in Nashik."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><AppShell>{children}</AppShell></body></html>;
}
