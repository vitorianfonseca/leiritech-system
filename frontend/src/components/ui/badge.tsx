import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // The pill is glass (see .glass-chip in globals.css); each variant only
  // says which light comes through it.
  "glass-chip inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "text-secondary-foreground",
        primary: "[--chip:var(--primary)] text-primary",
        signal: "[--chip:var(--signal)] text-signal",
        outline: "text-foreground",
        success: "[--chip:var(--success)] text-success",
        warning: "[--chip:var(--warning)] text-warning",
        info: "[--chip:var(--info)] text-info",
        destructive: "[--chip:var(--destructive)] text-destructive",
        // PSA status zones
        healthy: "[--chip:var(--health-healthy)] text-health-healthy",
        attention: "[--chip:var(--health-attention)] text-health-attention",
        atRisk: "[--chip:var(--health-at-risk)] text-health-at-risk",
        overdue: "[--chip:var(--status-overdue)] text-status-overdue",
        blocked: "[--chip:var(--status-blocked)] text-status-blocked",
        due: "[--chip:var(--status-due)] text-status-due",
        done: "[--chip:var(--status-done)] text-status-done",
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
