"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LEIRITECH_COLOR_TOKENS,
  LEIRITECH_COLOR_VAR,
  type LeiritechColorToken,
} from "@/lib/api/settings-types";

/** A small filled dot rendered in a config colour (uses an existing CSS var). */
export function ColorDot({
  color,
  className,
}: {
  color: LeiritechColorToken;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: LEIRITECH_COLOR_VAR[color] }}
    />
  );
}

/**
 * A tinted config chip (label + colour), used to preview tags / stages. Reads
 * the colour from a CSS var and derives a soft background via color-mix so the
 * chip stays inside the warm palette without inventing hex values.
 */
export function ColorChip({
  color,
  children,
  className,
}: {
  color: LeiritechColorToken;
  children: React.ReactNode;
  className?: string;
}) {
  const cssVar = LEIRITECH_COLOR_VAR[color];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        className
      )}
      style={{
        color: cssVar,
        borderColor: `color-mix(in oklch, ${cssVar} 35%, transparent)`,
        backgroundColor: `color-mix(in oklch, ${cssVar} 12%, transparent)`,
      }}
    >
      <ColorDot color={color} />
      {children}
    </span>
  );
}

/** Radio-group of colour swatches. Keyboard-navigable, uses roving tabindex. */
export function ColorPicker({
  value,
  onChange,
  label,
  id,
}: {
  value: LeiritechColorToken;
  onChange: (color: LeiritechColorToken) => void;
  label?: string;
  id?: string;
}) {
  const t = useTranslations("settings.colors");
  return (
    <div
      role="radiogroup"
      aria-label={label ?? t("label")}
      id={id}
      className="flex flex-wrap gap-2"
    >
      {LEIRITECH_COLOR_TOKENS.map((color) => {
        const active = color === value;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t(color)}
            onClick={() => onChange(color)}
            className={cn(
              "flex size-8 items-center justify-center rounded-full border-2 outline-none transition-transform",
              "focus-visible:ring-2 focus-visible:ring-ring hover:scale-105",
              active ? "border-foreground" : "border-transparent"
            )}
          >
            <span
              className="flex size-5 items-center justify-center rounded-full"
              style={{ backgroundColor: LEIRITECH_COLOR_VAR[color] }}
            >
              {active ? (
                <Check className="size-3.5 text-white" strokeWidth={3} aria-hidden />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
