"use client";

import { useTranslations } from "next-intl";
import { Palette, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ACCENTS, useAccent, type Accent } from "@/lib/use-accent";

/**
 * Pick the accent theme.
 *
 * The swatch beside each name is the accent's own colour, written out rather
 * than taken from a variable: the menu shows five themes at once and only one
 * of them is the active `--signal`, so a token would paint every swatch the
 * same. Keep these in step with the blocks in globals.css.
 */
const SWATCH: Record<Accent, string> = {
  rose: "oklch(0.600 0.145 358)",
  blue: "oklch(0.545 0.170 262)",
  violet: "oklch(0.565 0.165 300)",
  green: "oklch(0.540 0.105 168)",
  amber: "oklch(0.585 0.125 58)",
};

export function AccentPicker() {
  const t = useTranslations("theme.accent");
  const [accent, setAccent] = useAccent();

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label={t("label")}>
                  <Palette aria-hidden />
                </Button>
              }
            />
          }
        />
        <TooltipContent>{t("label")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {ACCENTS.map((a) => (
          <DropdownMenuItem key={a} onClick={() => setAccent(a)}>
            <span
              className="size-3.5 shrink-0 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: SWATCH[a] }}
              aria-hidden
            />
            {t(a)}
            {accent === a ? <Check className="ml-auto size-4" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
