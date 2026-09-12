"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: string;
  label: string;
}

export interface WizardStepperProps {
  steps: WizardStep[];
  /** 0-based index of the active step. */
  current: number;
  /** Highest step the user has reached (enables jumping back). */
  furthest: number;
  onStepClick: (index: number) => void;
  labels: { stepOf: (n: number, total: number) => string };
}

/**
 * Accessible progress stepper for the conversion wizard (WCAG AA). Rendered as
 * an ordered list; completed/active steps are keyboard-navigable buttons that
 * jump back, future steps are inert. Colour is reinforced with a check icon and
 * `aria-current`, never colour alone. Uses DESIGN.md tokens (signal = active).
 */
export function WizardStepper({
  steps,
  current,
  furthest,
  onStepClick,
  labels,
}: WizardStepperProps) {
  return (
    <nav aria-label={labels.stepOf(current + 1, steps.length)}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {steps.map((step, i) => {
          const isDone = i < current;
          const isCurrent = i === current;
          const reachable = i <= furthest;
          return (
            <li key={step.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => reachable && onStepClick(i)}
                disabled={!reachable}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  reachable ? "cursor-pointer" : "cursor-default",
                  isCurrent
                    ? "bg-signal-muted text-signal"
                    : isDone
                      ? "text-foreground hover:bg-accent"
                      : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    isCurrent
                      ? "bg-signal text-signal-foreground"
                      : isDone
                        ? "bg-success text-success-foreground"
                        : "border border-border bg-muted text-muted-foreground"
                  )}
                >
                  {isDone ? <Check className="size-3.5" strokeWidth={2.4} aria-hidden /> : i + 1}
                </span>
                <span className="hidden font-medium sm:inline">{step.label}</span>
              </button>
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn("h-px w-4 sm:w-8", isDone ? "bg-success/60" : "bg-border")}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
