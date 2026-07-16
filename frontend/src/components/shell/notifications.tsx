"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

/**
 * Foundation notifications popover. The bell + empty-state shell is real; the
 * notifications list (F15, the 12 automations) is wired by feature builders.
 * The unread-count dot is rendered when `unread > 0`.
 */
export function Notifications({ unread = 0 }: { unread?: number }) {
  const t = useTranslations("shell.notifications");

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("label")}
                  className="relative"
                />
              }
            />
          }
        >
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 size-2 rounded-full bg-gold ring-2 ring-background"
            />
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("label")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="font-heading text-sm font-semibold">{t("title")}</p>
          <button className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            {t("markAllRead")}
          </button>
        </div>
        <Separator />
        <div className="px-4 py-10 text-center">
          <Bell
            className="mx-auto mb-3 size-8 text-muted-foreground/50"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
