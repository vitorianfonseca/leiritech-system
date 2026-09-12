"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, X, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITIES,
  TASK_STATES,
  type TaskPriority,
  type TaskState,
} from "@/lib/api/tasks-types";

export interface TaskFilterState {
  projectId: string | null;
  assigneeId: string | null;
  state: TaskState | null;
  priority: TaskPriority | null;
  labelId: string | null;
}

export const EMPTY_FILTERS: TaskFilterState = {
  projectId: null,
  assigneeId: null,
  state: null,
  priority: null,
  labelId: null,
};

export function hasActiveFilters(f: TaskFilterState): boolean {
  return (
    f.projectId !== null ||
    f.assigneeId !== null ||
    f.state !== null ||
    f.priority !== null ||
    f.labelId !== null
  );
}

interface Option {
  value: string;
  label: string;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Option[];
  onChange: (value: string | null) => void;
}) {
  const t = useTranslations("tasks");
  const selected = options.find((o) => o.value === value) ?? null;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="justify-between gap-1.5">
            <span className="text-muted-foreground">{label}:</span>
            <span className="font-medium text-foreground">
              {selected ? selected.label : t("filters.all")}
            </span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" strokeWidth={1.8} aria-hidden />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56 p-1.5">
        <div className="max-h-64 overflow-y-auto">
          <FilterOption
            label={t("filters.all")}
            checked={value === null}
            onSelect={() => onChange(null)}
          />
          {options.map((opt) => (
            <FilterOption
              key={opt.value}
              label={opt.label}
              checked={value === opt.value}
              onSelect={() => onChange(opt.value)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterOption({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-signal bg-signal text-signal-foreground" : "border-input"
        )}
      >
        {checked ? <Check className="size-3" strokeWidth={2.5} aria-hidden /> : null}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export interface TaskFiltersProps {
  filters: TaskFilterState;
  onChange: (filters: TaskFilterState) => void;
  projects: Option[];
  assignees: Option[];
  labels: Option[];
}

/** Shared filter bar for tasks — applies across list, board and calendar. */
export function TaskFilters({
  filters,
  onChange,
  projects,
  assignees,
  labels,
}: TaskFiltersProps) {
  const t = useTranslations("tasks");
  const stateOptions: Option[] = TASK_STATES.map((s) => ({
    value: s,
    label: t(`state.${s}`),
  }));
  const priorityOptions: Option[] = TASK_PRIORITIES.map((p) => ({
    value: p,
    label: t(`priority.${p}`),
  }));
  const active = hasActiveFilters(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Filter className="size-4" strokeWidth={1.8} aria-hidden />
        <span className="hidden sm:inline">{t("filters.label")}</span>
      </span>
      <FilterSelect
        label={t("filters.project")}
        value={filters.projectId}
        options={projects}
        onChange={(v) => onChange({ ...filters, projectId: v })}
      />
      <FilterSelect
        label={t("filters.assignee")}
        value={filters.assigneeId}
        options={assignees}
        onChange={(v) => onChange({ ...filters, assigneeId: v })}
      />
      <FilterSelect
        label={t("filters.state")}
        value={filters.state}
        options={stateOptions}
        onChange={(v) => onChange({ ...filters, state: v as TaskState | null })}
      />
      <FilterSelect
        label={t("filters.priority")}
        value={filters.priority}
        options={priorityOptions}
        onChange={(v) => onChange({ ...filters, priority: v as TaskPriority | null })}
      />
      <FilterSelect
        label={t("filters.taskLabel")}
        value={filters.labelId}
        options={labels}
        onChange={(v) => onChange({ ...filters, labelId: v })}
      />
      {active ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-muted-foreground"
        >
          <X aria-hidden />
          {t("filters.clear")}
        </Button>
      ) : null}
    </div>
  );
}
