import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold leading-none tracking-[0.02em]", {
  variants: { variant: {
    neutral: "border-[#e1e7e4] bg-[#f7f9f8] text-[#5c6b64]",
    green: "border-[#cde2d5] bg-[#e8f1ec] text-[#27664d]",
    blue: "border-[#dbe5ea] bg-[#edf2f4] text-[#5d7482]",
    warning: "border-[#f2dfb9] bg-[#fff4df] text-[#a36a18]",
    critical: "border-[#f2d2cf] bg-[#fcedea] text-[#b54742]"
  } }, defaultVariants: { variant: "neutral" }
});
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
