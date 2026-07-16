"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "error" | "success" | "info";

interface FormAlertProps {
  tone: Tone;
  title: string;
  description?: string;
}

const TONE_STYLES: Record<
  Tone,
  { wrapper: string; icon: React.ComponentType<{ className?: string }>; live: "assertive" | "polite" }
> = {
  error: {
    wrapper: "border-destructive/30 bg-destructive-muted text-destructive",
    icon: AlertCircle,
    live: "assertive",
  },
  success: {
    wrapper: "border-success/30 bg-success-muted text-success",
    icon: CheckCircle2,
    live: "polite",
  },
  info: {
    wrapper: "border-info/30 bg-info-muted text-info",
    icon: Info,
    live: "polite",
  },
};

/**
 * Banner for form-level feedback (auth errors, success confirmations). Uses a
 * live region so screen readers announce the message, and pairs colour with an
 * icon + text so meaning never relies on colour alone (WCAG AA).
 */
export function FormAlert({ tone, title, description }: FormAlertProps) {
  const { wrapper, icon: Icon, live } = TONE_STYLES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={live}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
        wrapper,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {description ? (
          <span className="text-foreground/70">{description}</span>
        ) : null}
      </div>
    </div>
  );
}
