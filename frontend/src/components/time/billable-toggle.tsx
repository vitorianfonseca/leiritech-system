"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CircleDollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BillableToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Accessible billable switch. Uses a real `role="switch"` button (keyboard +
 * `aria-checked`) rather than colour alone — the label and icon state both
 * change with `value`, meeting WCAG AA (never rely on colour).
 */
export function BillableToggle({ value, onChange, disabled, id }: BillableToggleProps) {
  const t = useTranslations("time.billable");
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        value
          ? "border-transparent bg-success-muted text-success"
          : "border-border bg-muted text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
          value ? "bg-success" : "bg-border"
        )}
        aria-hidden
      >
        <span
          className={cn(
            "inline-block size-3 rounded-full bg-background transition-transform",
            value ? "translate-x-3.5" : "translate-x-0.5"
          )}
        />
      </span>
      <CircleDollarSign className="size-4" strokeWidth={1.8} aria-hidden />
      {value ? t("on") : t("off")}
    </button>
  );
}

/** Read-only billable indicator for tables (colour + label, never colour alone). */
export function BillableBadge({ billable }: { billable: boolean }) {
  const t = useTranslations("time.billable");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        billable
          ? "border-transparent bg-success-muted text-success"
          : "border-border bg-muted text-muted-foreground"
      )}
    >
      <CircleDollarSign className="size-3" strokeWidth={1.8} aria-hidden />
      {billable ? t("on") : t("off")}
    </span>
  );
}
