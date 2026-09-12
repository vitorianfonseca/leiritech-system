"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Save, RotateCcw, TriangleAlert, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, toast, SkeletonList } from "@/components/shared";
import { settingsApi } from "@/lib/api/settings";
import type { LeiritechColorToken, PipelineStageConfig } from "@/lib/api/settings-types";
import type { PipelineStageId } from "@/lib/api/opportunities-types";
import type { Role } from "@/lib/session";
import { SortableStageRow } from "./sortable-stage-row";

export interface PipelineStagesViewProps {
  role: Role;
}

const STAGES_KEY = ["settings-pipeline-stages"] as const;

function equal(a: PipelineStageConfig[], b: PipelineStageConfig[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => {
    const o = b[i];
    return s.id === o.id && s.winProbability === o.winProbability && s.color === o.color;
  });
}

export function PipelineStagesView({ role }: PipelineStagesViewProps) {
  const t = useTranslations("settings.pipeline");
  const tErr = useTranslations("settings.pipeline.errors");

  const query = useQuery({
    queryKey: STAGES_KEY,
    queryFn: () => settingsApi.getPipelineStageConfigs(),
  });

  const [draft, setDraft] = React.useState<PipelineStageConfig[]>([]);
  const [saving, setSaving] = React.useState(false);

  // Sync draft when server data (re)loads.
  const serverData = query.data;
  const [syncedFrom, setSyncedFrom] = React.useState<PipelineStageConfig[] | null>(null);
  if (serverData && serverData !== syncedFrom) {
    setSyncedFrom(serverData);
    setDraft(serverData.map((s) => ({ ...s })));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const dirty = serverData ? !equal(draft, serverData) : false;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      const ids = prev.map((s) => s.id);
      const oldIndex = ids.indexOf(active.id as PipelineStageId);
      const newIndex = ids.indexOf(over.id as PipelineStageId);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((s, i) => ({ ...s, order: i + 1 }));
    });
  }

  function setProbability(id: PipelineStageId, value: number) {
    const clamped = Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, value));
    setDraft((prev) => prev.map((s) => (s.id === id ? { ...s, winProbability: clamped } : s)));
  }

  function setColor(id: PipelineStageId, color: LeiritechColorToken) {
    setDraft((prev) => prev.map((s) => (s.id === id ? { ...s, color } : s)));
  }

  function reset() {
    if (serverData) setDraft(serverData.map((s) => ({ ...s })));
  }

  async function save() {
    try {
      setSaving(true);
      const next = await settingsApi.updatePipelineStages(role, {
        stages: draft.map((s, i) => ({
          id: s.id,
          order: i + 1,
          winProbability: s.winProbability,
          color: s.color,
        })),
      });
      setSyncedFrom(next);
      setDraft(next.map((s) => ({ ...s })));
      query.refetch();
      toast({ tone: "success", title: t("saved") });
    } catch {
      toast({ tone: "destructive", title: tErr("saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={reset} disabled={!dirty || saving}>
              <RotateCcw aria-hidden />
              <span className="hidden sm:inline">{t("reset")}</span>
            </Button>
            <Button onClick={save} disabled={!dirty || saving}>
              <Save aria-hidden />
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
        <p>{t("notice")}</p>
      </div>

      {query.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title={tErr("loadTitle")}
          description={tErr("loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => query.refetch()}>
              <RefreshCw aria-hidden />
              {tErr("retry")}
            </Button>
          }
        />
      ) : query.isLoading ? (
        <SkeletonList rows={6} media={false} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draft.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {draft.map((stage, index) => (
                <li key={stage.id}>
                  <SortableStageRow
                    stage={stage}
                    index={index}
                    onProbabilityChange={setProbability}
                    onColorChange={setColor}
                  />
                </li>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
