import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { DEMO_LABEL } from "@/lib/demo";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div><div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#63806d]">{eyebrow}</div><h1 className="text-[27px] font-semibold leading-tight tracking-[-0.035em] text-[#213027] sm:text-[31px]">{title}</h1><p className="mt-2 max-w-[680px] text-sm leading-6 text-[#69776f]">{description}</p><div className="mt-3"><Badge variant="blue">{DEMO_LABEL}</Badge></div></div>
    {action && <div className="shrink-0">{action}</div>}
  </div>;
}
