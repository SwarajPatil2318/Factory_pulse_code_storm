import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon, title, description, compact = false, children }: { icon: LucideIcon; title: string; description: string; compact?: boolean; children?: React.ReactNode }) {
  return <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-[#dbe4de] bg-[#fbfcfb] px-6 text-center", compact ? "min-h-[210px] py-8" : "min-h-[300px] py-12")}>
    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-[#dfe8e2] bg-white text-[#5a806a]"><Icon size={21} strokeWidth={1.7} /></div>
    <h3 className="text-sm font-semibold text-[#28372f]">{title}</h3>
    <p className="mt-2 max-w-sm text-sm leading-6 text-[#748078]">{description}</p>
    {children && <div className="mt-5">{children}</div>}
  </div>;
}
