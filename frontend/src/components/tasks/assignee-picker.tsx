"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { TaskAssignee } from "@/lib/api/tasks-types";
import { initials } from "./task-meta";

export interface AssigneePickerProps {
  directory: TaskAssignee[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

/** Multi-select assignee control — a token list plus an add popover. */
export function AssigneePicker({
  directory,
  value,
  onChange,
  disabled,
}: AssigneePickerProps) {
  const t = useTranslations("tasks");
  const selected = directory.filter((u) => value.includes(u.userId));

  function toggle(userId: string) {
    onChange(
      value.includes(userId)
        ? value.filter((id) => id !== userId)
        : [...value, userId]
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((u) => (
        <span
          key={u.userId}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted py-0.5 pl-1 pr-2 text-xs"
        >
          <Avatar className="size-5">
            <AvatarFallback className="text-[0.5rem]">{initials(u.name)}</AvatarFallback>
          </Avatar>
          <span className="font-medium">{u.name}</span>
          {!disabled ? (
            <button
              type="button"
              onClick={() => toggle(u.userId)}
              aria-label={t("assignees.remove", { name: u.name })}
              className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </span>
      ))}

      {selected.length === 0 ? (
        <span className="text-xs text-muted-foreground">{t("assignees.none")}</span>
      ) : null}

      {!disabled ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm" className="h-7 gap-1">
                {selected.length > 0 ? (
                  <ChevronsUpDown className="size-3.5" strokeWidth={1.8} aria-hidden />
                ) : (
                  <UserPlus className="size-3.5" strokeWidth={1.8} aria-hidden />
                )}
                <span>{t("assignees.add")}</span>
              </Button>
            }
          />
          <PopoverContent align="start" className="w-56 p-1.5">
            <div className="max-h-64 overflow-y-auto">
              {directory.map((u) => {
                const checked = value.includes(u.userId);
                return (
                  <button
                    key={u.userId}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    onClick={() => toggle(u.userId)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        checked ? "border-signal bg-signal text-signal-foreground" : "border-input"
                      )}
                    >
                      {checked ? <Check className="size-3" strokeWidth={2.5} aria-hidden /> : null}
                    </span>
                    <Avatar className="size-5">
                      <AvatarFallback className="text-[0.5rem]">
                        {initials(u.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{u.name}</span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
