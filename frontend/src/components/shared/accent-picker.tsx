"use client";

import { useTranslations } from "next-intl";
import { Palette, Check, Pipette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useAccent, type Accent } from "@/lib/use-accent";

/**
 * Pick the accent theme.
 *
 * The swatch beside each name is that accent's own colour, written out rather
 * than read from a token: the menu shows every theme at once and only one of
 * them is the live `--signal`, so a variable would paint all the swatches the
 * same. Keep these in step with the blocks in globals.css.
 *
 * The set is split in two because the choice is: a colour, or no colour. The
 * muted half is for someone who wants the tool to recede.
 */
const SWATCH: Record<string, string> = {
  rose: "oklch(0.600 0.145 358)",
  blue: "oklch(0.545 0.170 262)",
  violet: "oklch(0.565 0.165 300)",
  green: "oklch(0.540 0.105 168)",
  amber: "oklch(0.585 0.125 58)",
  slate: "oklch(0.500 0.045 255)",
  sand: "oklch(0.520 0.060 70)",
  olive: "oklch(0.505 0.065 130)",
  plum: "oklch(0.510 0.080 320)",
};

const VIVID: Accent[] = ["rose", "blue", "violet", "green", "amber"];
const MUTED: Accent[] = ["slate", "sand", "olive", "plum"];

export function AccentPicker() {
  const t = useTranslations("theme.accent");
  const { accent, customHex, setAccent, setCustomHex } = useAccent();

  function Row({ value }: { value: Accent }) {
    return (
      <DropdownMenuItem onClick={() => setAccent(value)}>
        <span
          className="size-3.5 shrink-0 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: SWATCH[value] }}
          aria-hidden
        />
        {t(value)}
        {accent === value ? <Check className="ml-auto size-4" aria-hidden /> : null}
      </DropdownMenuItem>
    );
  }

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
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>{t("vivid")}</DropdownMenuLabel>
        {VIVID.map((a) => (
          <Row key={a} value={a} />
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("muted")}</DropdownMenuLabel>
        {MUTED.map((a) => (
          <Row key={a} value={a} />
        ))}

        <DropdownMenuSeparator />
        {/* A real, visible colour input rather than a hidden one triggered in
            code. A programmatic .click() on an sr-only input does not reliably
            open the OS picker, which is why the custom colour did nothing.
            This is not a menu item either: menu items close on click and
            steal focus, and the swatch has to stay put while the OS picker is
            open over it.

            `onInput` as well as `onChange` so the page recolours while the
            picker is being dragged, not only when it is dismissed. */}
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <label
            className="relative size-6 shrink-0 cursor-pointer rounded-full ring-1 ring-black/15"
            style={{ backgroundColor: customHex }}
            aria-label={t("custom")}
          >
            <input
              type="color"
              value={customHex}
              onInput={(e) => setCustomHex((e.target as HTMLInputElement).value)}
              onChange={(e) => setCustomHex(e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
          <span className="text-sm">{t("custom")}</span>
          {accent === "custom" ? (
            <Check className="ml-auto size-4 shrink-0" aria-hidden />
          ) : (
            <Pipette className="ml-auto size-3.5 shrink-0 opacity-50" aria-hidden />
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
