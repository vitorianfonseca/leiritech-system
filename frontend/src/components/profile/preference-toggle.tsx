"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Accessible on/off switch for a single notification channel. Uses a native
 * button with `role="switch"` + `aria-checked` (the proven shell pattern) so it
 * is keyboard reachable and announced correctly. Gold when on. Motion respects
 * prefers-reduced-motion.
 */
export function PreferenceToggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none transition-colors duration-200 ease-out motion-reduce:transition-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-gold" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-card shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
