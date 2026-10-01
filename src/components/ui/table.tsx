import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <div className="w-full overflow-x-auto"><table className={cn("w-full border-collapse text-left text-sm", className)} {...props} /></div>;
}
export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) { return <thead className={cn("bg-[#f8faf9]", className)} {...props} />; }
export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) { return <tbody className={className} {...props} />; }
export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) { return <tr className={cn("border-b border-[#e9eeeb] last:border-0", className)} {...props} />; }
export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) { return <th className={cn("h-10 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#718077]", className)} {...props} />; }
export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) { return <td className={cn("px-4 py-4 text-[#34423b]", className)} {...props} />; }
