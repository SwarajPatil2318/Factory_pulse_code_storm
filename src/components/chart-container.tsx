import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { BarChart3 } from "lucide-react";

/** Slot for future Recharts visualizations. Keeps titles, spacing, and empty states consistent. */
export function ChartContainer({ title, description, children, empty = false }: { title: string; description?: string; children?: ReactNode; empty?: boolean }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader><CardContent>
    {empty ? <EmptyState icon={BarChart3} title="Chart awaiting data" description="This view will appear when the analytics layer is connected." compact /> : <div className="min-h-[260px] w-full">{children}</div>}
  </CardContent></Card>;
}
