"use client";

import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useHideAmounts } from "@/lib/use-privacy";

/** Curtain for monetary figures. Sits in the top bar, one click, no dialog. */
export function PrivacyToggle() {
  const t = useTranslations("shell.privacy");
  const { hidden, toggle } = useHideAmounts();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => toggle(!hidden)}
            aria-pressed={hidden}
            aria-label={hidden ? t("show") : t("hide")}
          />
        }
      >
        {hidden ? <EyeOff className="text-signal" aria-hidden /> : <Eye aria-hidden />}
      </TooltipTrigger>
      <TooltipContent>{hidden ? t("show") : t("hide")}</TooltipContent>
    </Tooltip>
  );
}
