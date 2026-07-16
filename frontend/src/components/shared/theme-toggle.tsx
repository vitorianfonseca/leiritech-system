"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export function ThemeToggle() {
  const t = useTranslations("theme");
  const { resolvedTheme, setTheme } = useTheme();

  // The resolved theme is only known on the client (localStorage / system media
  // query), so the server can't know which icon to render. Mount detection
  // without setState-in-effect: false during SSR/hydration, true on the client,
  // so the first client render matches the server (Sun) and the correct icon
  // swaps in after hydration — no hydration mismatch warning on dark.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("toggle")}
            onClick={() => setTheme(isDark ? "light" : "dark")}
          />
        }
      >
        <span suppressHydrationWarning>{isDark ? <Moon /> : <Sun />}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t("toggle")}</TooltipContent>
    </Tooltip>
  );
}
