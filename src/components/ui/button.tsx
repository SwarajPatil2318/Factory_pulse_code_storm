import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8cb6a0] disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: {
      default: "bg-[#27664d] text-white hover:bg-[#20583f]",
      outline: "border border-[#dbe3df] bg-white text-[#31423b] hover:bg-[#f5f8f6]",
      ghost: "text-[#55645e] hover:bg-[#eef3f0] hover:text-[#202b29]"
    },
    size: { default: "h-9 px-4", sm: "h-8 px-3 text-xs", icon: "h-9 w-9" }
  },
  defaultVariants: { variant: "default", size: "default" }
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";
