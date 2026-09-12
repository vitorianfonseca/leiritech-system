import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        primary: "border-transparent bg-primary text-primary-foreground",
        signal: "border-transparent bg-signal-muted text-signal",
        outline: "border-border text-foreground",
        success: "border-transparent bg-success-muted text-success",
        warning: "border-transparent bg-warning-muted text-warning-foreground",
        info: "border-transparent bg-info-muted text-info",
        destructive: "border-transparent bg-destructive-muted text-destructive",
        // PSA status zones
        healthy: "border-transparent bg-health-healthy-bg text-health-healthy",
        attention: "border-transparent bg-health-attention-bg text-health-attention",
        atRisk: "border-transparent bg-health-at-risk-bg text-health-at-risk",
        overdue: "border-transparent bg-status-overdue-bg text-status-overdue",
        blocked: "border-transparent bg-status-blocked-bg text-status-blocked",
        due: "border-transparent bg-status-due-bg text-status-due",
        done: "border-transparent bg-status-done-bg text-status-done",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
