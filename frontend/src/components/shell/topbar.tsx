"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search, Menu } from "lucide-react";
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
import { Kbd } from "@/components/ui/kbd";

function openCommand() {
  window.dispatchEvent(new Event(OPEN_COMMAND_EVENT));
}

export function Topbar({ user }: { user: SessionUser }) {
  const t = useTranslations("shell");

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-sidebar px-4 md:px-6">
      <MobileNavTrigger icon={<Menu />} />

      {/* Search / command palette trigger */}
      <button
        type="button"
        onClick={openCommand}
        className="glass group flex h-9 w-full max-w-md items-center gap-2.5 rounded-xl px-3 text-sm text-muted-foreground hover:text-foreground"
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
