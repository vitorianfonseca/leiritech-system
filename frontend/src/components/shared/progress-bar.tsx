"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cn } from "@/lib/utils";

type Tone = "primary" | "signal" | "success" | "warning" | "destructive" | "info";

const toneClass: Record<Tone, string> = {
  primary: "bg-primary",
  signal: "bg-signal",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-info",
};

export interface ProgressBarProps
  extends Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, "value" | "render"> {
  /** Current value; `null` renders an indeterminate bar. */
  value: number | null;
  max?: number;
  /** Fill colour from the design tokens. */
  tone?: Tone;
  size?: "sm" | "md";
  /** Accessible name for the progress bar. */
  label?: string;
  /** Show the numeric percentage beside the label. */
  showValue?: boolean;
}

/**
 * Accessible progress bar built on the base-ui Progress primitive. Consumes
 * design tokens only (no invented colours). Indeterminate when `value` is null.
 */
export function ProgressBar({
  value,
  max = 100,
  tone = "primary",
  size = "md",
  label,
  showValue = false,
  className,
  ...props
}: ProgressBarProps) {
  const indeterminate = value === null;
  return (
    <ProgressPrimitive.Root
      value={value}
      max={max}
      className={cn("w-full", className)}
      aria-label={label}
      {...props}
    >
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
          {label ? (
            <ProgressPrimitive.Label className="font-medium text-foreground">
              {label}
            </ProgressPrimitive.Label>
          ) : (
            <span />
          )}
          {showValue && !indeterminate ? (
            <ProgressPrimitive.Value className="tabular-nums text-muted-foreground" />
          ) : null}
        </div>
      )}
      <ProgressPrimitive.Track
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-muted",
          size === "sm" ? "h-1.5" : "h-2.5"
        )}
      >
        <ProgressPrimitive.Indicator
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-out",
            toneClass[tone],
            indeterminate && "w-1/3 motion-safe:animate-[progress-indeterminate_1.2s_ease-in-out_infinite]"
          )}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}
