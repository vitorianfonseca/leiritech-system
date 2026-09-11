"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageHeader } from "@/components/shell/page-header";
import { SkeletonList, toast } from "@/components/shared";
import { settingsApi } from "@/lib/api/settings";
import {
  TASK_STATE_IDS,
  taskStateBadgeVariant,
  type LeiritechColorToken,
  type PriorityConfig,
  type PriorityId,
} from "@/lib/api/settings-types";
import type { Role } from "@/lib/session";
import { ColorDot, ColorPicker } from "./settings-colors";

export interface StatesSettingsViewProps {
  role: Role;
}

const PRIORITIES_KEY = ["settings-priorities"] as const;

export function StatesSettingsView({ role }: StatesSettingsViewProps) {
  const t = useTranslations("settings.states");
  const tState = useTranslations("settings.states.taskStates");
  const tPrio = useTranslations("settings.states.priorities");
  const qc = useQueryClient();

  const query = useQuery({ queryKey: PRIORITIES_KEY, queryFn: () => settingsApi.getPriorities() });

  async function setColor(id: PriorityId, color: LeiritechColorToken) {
    try {
      await settingsApi.updatePriority(role, { id, color });
      await qc.invalidateQueries({ queryKey: PRIORITIES_KEY });
      toast({ tone: "success", title: t("prioritySaved", { name: tPrio(id) }) });
    } catch {
      toast({ tone: "destructive", title: t("errors.saveFailed") });
    }
  }

  const priorities = query.data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Task states — view only */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-base font-semibold text-foreground">{t("taskStatesTitle")}</h2>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
          <p>{t("taskStatesNotice")}</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {TASK_STATE_IDS.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div>
                <p className="font-medium text-foreground">{tState(`${id}.title`)}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{tState(`${id}.description`)}</p>
              </div>
              <Badge variant={taskStateBadgeVariant(id)}>{tState(`${id}.title`)}</Badge>
            </li>
          ))}
        </ul>
      </section>

      {/* Priorities — editable colour */}
      <section className="space-y-3">
        <h2 className="font-heading text-base font-semibold text-foreground">{t("prioritiesTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("prioritiesNotice")}</p>
        {query.isLoading ? (
          <SkeletonList rows={4} media={false} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {priorities.map((prio: PriorityConfig) => (
              <li
                key={prio.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <span className="inline-flex items-center gap-2 font-medium text-foreground">
                  <ColorDot color={prio.color} className="size-3" />
                  {tPrio(prio.id)}
                </span>
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button variant="outline" size="sm" aria-label={t("changeColor", { name: tPrio(prio.id) })}>
                        <ColorDot color={prio.color} className="size-3" />
                        {t("color")}
                      </Button>
                    }
                  />
                  <PopoverContent align="end" className="w-auto p-3">
                    <ColorPicker
                      value={prio.color}
                      onChange={(color) => setColor(prio.id, color)}
                      label={t("changeColor", { name: tPrio(prio.id) })}
                    />
                  </PopoverContent>
                </Popover>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
