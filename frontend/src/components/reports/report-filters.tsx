"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableCombobox, type ComboboxItem } from "@/components/shared";
import type { ReportDataset, ReportFilters } from "@/lib/api/reports-types";

export interface ReportFiltersBarProps {
  value: ReportFilters;
  onChange: (patch: Partial<ReportFilters>) => void;
  onClear: () => void;
  options: ReportDataset["filterOptions"];
  /** Hide the client filter when the group has no client dimension. */
  showClient?: boolean;
}

function toItems(opts: { id: string; name: string }[]): ComboboxItem[] {
  return opts.map((o) => ({ value: o.id, label: o.name }));
}

/**
 * The reports filter bar: date range + client / project / member / state.
 * All controls are optional; changing any one re-derives every report on the
 * client (no refetch). Locale is never in the URL — filters are local state.
 */
export function ReportFiltersBar({
  value,
  onChange,
  onClear,
  options,
  showClient = true,
}: ReportFiltersBarProps) {
  const t = useTranslations("reports.filters");
  const tStates = useTranslations("projects.states");

  const stateItems = React.useMemo<ComboboxItem[]>(
    () => options.states.map((s) => ({ value: s, label: tStates(s) })),
    [options.states, tStates]
  );

  const active =
    value.from ||
    value.to ||
    value.clientId ||
    value.projectId ||
    value.memberId ||
    value.state;

  return (
    <section
      aria-label={t("ariaLabel")}
      className="rounded-xl border border-border bg-card/60 p-4 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="space-y-1.5">
          <Label htmlFor="report-from" className="text-xs text-muted-foreground">
            {t("from")}
          </Label>
          <Input
            id="report-from"
            type="date"
            value={value.from ?? ""}
            max={value.to ?? undefined}
            onChange={(e) => onChange({ from: e.target.value || null })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="report-to" className="text-xs text-muted-foreground">
            {t("to")}
          </Label>
          <Input
            id="report-to"
            type="date"
            value={value.to ?? ""}
            min={value.from ?? undefined}
            onChange={(e) => onChange({ to: e.target.value || null })}
          />
        </div>

        {showClient ? (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("client")}</Label>
            <SearchableCombobox
              items={toItems(options.clients)}
              value={value.clientId}
              onValueChange={(v) => onChange({ clientId: v })}
              placeholder={t("allClients")}
              aria-label={t("client")}
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("project")}</Label>
          <SearchableCombobox
            items={toItems(options.projects)}
            value={value.projectId}
            onValueChange={(v) => onChange({ projectId: v })}
            placeholder={t("allProjects")}
            aria-label={t("project")}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("member")}</Label>
          <SearchableCombobox
            items={toItems(options.members)}
            value={value.memberId}
            onValueChange={(v) => onChange({ memberId: v })}
            placeholder={t("allMembers")}
            aria-label={t("member")}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("state")}</Label>
          <SearchableCombobox
            items={stateItems}
            value={value.state}
            onValueChange={(v) => onChange({ state: v })}
            placeholder={t("allStates")}
            aria-label={t("state")}
          />
        </div>
      </div>

      {active ? (
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X aria-hidden />
            {t("clear")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
