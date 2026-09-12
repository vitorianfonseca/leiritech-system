"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Type, Check } from "lucide-react";
import { useTextSize } from "@/components/providers/text-size-provider";
import { TEXT_SIZES } from "@/lib/text-size";
import { cn } from "@/lib/utils";

/**
 * Text-size selector (Compacto / Normal / Grande). Styled like the theme picker
 * so the two prefs read as one family. Applies instantly via the TextSizeProvider
 * (no reload). Each option previews its own scale via the icon size.
 */
const ICON_SIZE: Record<(typeof TEXT_SIZES)[number], string> = {
  compact: "size-4",
  normal: "size-5",
  large: "size-6",
};

export function TextSizeSwitcher() {
  const t = useTranslations("preferences.textSize");
  const { textSize, setTextSize } = useTextSize();

  return (
    <div
      role="radiogroup"
      aria-label={t("title")}
      className="grid gap-3 sm:grid-cols-3"
    >
      {TEXT_SIZES.map((value) => {
        const selected = textSize === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTextSize(value)}
            className={cn(
              "group flex flex-col items-start gap-3 rounded-xl border p-4 text-left outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-signal bg-signal-muted/40" : "border-border bg-card hover:bg-accent"
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg",
                  selected ? "bg-signal text-signal-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                <Type className={ICON_SIZE[value]} strokeWidth={1.8} aria-hidden />
              </span>
              {selected ? (
                <Check className="size-4 text-signal" strokeWidth={2.4} aria-hidden />
              ) : null}
            </div>
            <div>
              <p className="font-medium text-foreground">{t(`options.${value}.title`)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t(`options.${value}.description`)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
