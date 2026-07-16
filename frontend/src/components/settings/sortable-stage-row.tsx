"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AureaColorToken, PipelineStageConfig } from "@/lib/api/settings-types";
import { ColorDot, ColorPicker } from "./settings-colors";

export interface SortableStageRowProps {
  stage: PipelineStageConfig;
  index: number;
  onProbabilityChange: (id: PipelineStageConfig["id"], value: number) => void;
  onColorChange: (id: PipelineStageConfig["id"], color: AureaColorToken) => void;
}

export function SortableStageRow({
  stage,
  index,
  onProbabilityChange,
  onColorChange,
}: SortableStageRowProps) {
  const t = useTranslations("settings.pipeline");
  const tStage = useTranslations("pipeline.stages");
  const probId = React.useId();

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const stageName = tStage(stage.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-nowrap",
        isDragging && "z-10 opacity-90 shadow-lg"
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        aria-label={t("reorder", { name: stageName })}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" strokeWidth={1.8} aria-hidden />
      </button>

      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
        {index + 1}
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ColorDot color={stage.color} className="size-3" />
        <span className="truncate font-medium text-foreground">{stageName}</span>
      </div>

      {/* Colour picker */}
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" aria-label={t("colorFor", { name: stageName })}>
              <ColorDot color={stage.color} className="size-3" />
              <span className="hidden sm:inline">{t("colorLabel")}</span>
            </Button>
          }
        />
        <PopoverContent align="end" className="w-auto p-3">
          <ColorPicker
            value={stage.color}
            onChange={(color) => onColorChange(stage.id, color)}
            label={t("colorFor", { name: stageName })}
          />
        </PopoverContent>
      </Popover>

      {/* Win probability */}
      <div className="flex shrink-0 items-center gap-2">
        <Label htmlFor={probId} className="text-xs text-muted-foreground">
          {t("probability")}
        </Label>
        <div className="relative">
          <Input
            id={probId}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={stage.winProbability}
            onChange={(e) => onProbabilityChange(stage.id, Number(e.target.value))}
            className="h-9 w-20 pr-7 text-right tabular-nums"
            aria-label={t("probabilityFor", { name: stageName })}
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            %
          </span>
        </div>
      </div>
    </div>
  );
}
