"use client";

import { useTranslations } from "next-intl";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useSound } from "@/lib/use-sound";

/**
 * Sound lives next to theme in the top bar, not buried in Profile.
 *
 * It stays off until someone asks for it — a work tool has no business making
 * noise unprompted — but a preference nobody can find is a preference nobody
 * has. One click, visible, reversible, and turning it on confirms itself
 * audibly so the effect of the switch is never in doubt.
 */
export function SoundToggle() {
  const t = useTranslations("shell.sound");
  const { enabled, toggle } = useSound();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => toggle(!enabled)}
            aria-pressed={enabled}
            aria-label={enabled ? t("disable") : t("enable")}
          />
        }
      >
        {enabled ? (
          <Volume2 className="text-signal" aria-hidden />
        ) : (
          <VolumeX aria-hidden />
        )}
      </TooltipTrigger>
      <TooltipContent>{enabled ? t("disable") : t("enable")}</TooltipContent>
    </Tooltip>
  );
}
