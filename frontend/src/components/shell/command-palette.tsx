"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, CornerDownLeft, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { visibleSections } from "./nav-config";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export const OPEN_COMMAND_EVENT = "leiritech:command-open";

interface CommandAction {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  href: string;
}

export function CommandPalette({ user }: { user: SessionUser }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const actions = React.useMemo<CommandAction[]>(() => {
    const nav = visibleSections(user).flatMap((section) =>
      section.items.map((item) => ({
        id: `nav-${item.key}`,
        label: t(`nav.${item.key}`),
        group: t("shell.commandPalette.groupNavigation"),
        icon: item.icon,
        href: item.href,
      }))
    );
    const create: CommandAction[] = [
      { id: "c-opp", label: t("shell.quickCreate.opportunity"), href: "/crm/pipeline", icon: Plus },
      { id: "c-company", label: t("shell.quickCreate.company"), href: "/crm/companies/new", icon: Plus },
      { id: "c-project", label: t("shell.quickCreate.project"), href: "/projects/new", icon: Plus },
      { id: "c-task", label: t("shell.quickCreate.task"), href: "/tasks", icon: Plus },
    ].map((c) => ({ ...c, group: t("shell.commandPalette.groupCreate") }));
    return [...nav, ...create];
  }, [user, t]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [actions, query]);

  const handleOpenChange = React.useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActive(0);
    }
  }, []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpen);
    };
  }, []);

  function go(action: CommandAction | undefined) {
    if (!action) return;
    setOpen(false);
    setQuery("");
    router.push(action.href);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(filtered[active]);
    }
  }

  // Group filtered actions preserving group order.
  const groups = React.useMemo(() => {
    const map = new Map<string, CommandAction[]>();
    for (const a of filtered) {
      if (!map.has(a.group)) map.set(a.group, []);
      map.get(a.group)!.push(a);
    }
    return Array.from(map.entries());
  }, [filtered]);

  let runningIndex = -1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="top-[10%] max-w-xl overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onListKeyDown}
            placeholder={t("shell.commandPalette.placeholder")}
            aria-label={t("shell.commandPalette.title")}
            className="h-14 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("shell.commandPalette.empty")}
            </p>
          )}
          {groups.map(([group, items]) => (
            <div key={group} className="mb-1">
              <p className="px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group}
              </p>
              {items.map((action) => {
                runningIndex += 1;
                const idx = runningIndex;
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(action)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      idx === active
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                    <span className="truncate">{action.label}</span>
                    {idx === active && (
                      <CornerDownLeft className="ml-auto size-3.5 text-muted-foreground" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <span>·</span>
          <Kbd>↵</Kbd>
          <span>{t("shell.commandPalette.hint")}</span>
          <Kbd className="ml-auto">Esc</Kbd>
        </div>
      </DialogContent>
    </Dialog>
  );
}
