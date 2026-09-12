"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search, Menu, CircleHelp } from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { OPEN_COMMAND_EVENT } from "./command-palette";
import { MobileNavTrigger } from "./mobile-nav";
import { QuickCreate } from "./quick-create";
import { Notifications } from "./notifications";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { SoundToggle } from "@/components/shared/sound-toggle";
import { PrivacyToggle } from "@/components/shared/privacy-toggle";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

function openCommand() {
  window.dispatchEvent(new Event(OPEN_COMMAND_EVENT));
}

export function Topbar({ user }: { user: SessionUser }) {
  const t = useTranslations("shell");

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background px-4 backdrop-blur-md md:px-6">
      <MobileNavTrigger icon={<Menu />} />

      {/* Search / command palette trigger */}
      <button
        type="button"
        onClick={openCommand}
        className="group flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-input bg-card px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:border-ring/50 hover:text-foreground"
        aria-label={t("commandPalette.openLabel")}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{t("search.placeholder")}</span>
        <span className="ml-auto hidden items-center gap-1 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      {/* No gap: a 4px strip between two icon buttons is a dead zone the
          pointer crosses constantly, flicking the cursor back to an arrow on
          every pass. The buttons sit flush and their hover surface separates
          them, the way a native toolbar does. */}
      <div className="ml-auto flex items-center">
        <QuickCreate user={user} />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <Notifications user={user} />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("help.label")}
                className="hidden sm:inline-flex"
              />
            }
          >
            <CircleHelp />
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("help.label")}</TooltipContent>
        </Tooltip>
        <PrivacyToggle />
        <SoundToggle />
        <ThemeToggle />
        <LocaleSwitcher />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
