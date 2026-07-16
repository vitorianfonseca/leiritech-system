"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Tags as TagsIcon, TriangleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import {
  SmartTable,
  EmptyState,
  ConfirmDialog,
  toast,
  toastWithUndo,
  type SmartTableColumn,
} from "@/components/shared";
import { settingsApi } from "@/lib/api/settings";
import { SettingsError, type Tag } from "@/lib/api/settings-types";
import type { Role } from "@/lib/session";
import { ColorChip } from "./settings-colors";
import { TagFormDialog, type TagFormValues } from "./tag-form-dialog";

export interface TagsSettingsViewProps {
  role: Role;
}

const TAGS_KEY = ["settings-tags"] as const;

export function TagsSettingsView({ role }: TagsSettingsViewProps) {
  const t = useTranslations("settings.tags");
  const tErr = useTranslations("settings.tags.errors");
  const qc = useQueryClient();

  const query = useQuery({ queryKey: TAGS_KEY, queryFn: () => settingsApi.listTags() });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Tag | null>(null);
  const [serverErrorKey, setServerErrorKey] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [target, setTarget] = React.useState<Tag | null>(null);

  const refresh = React.useCallback(
    () => qc.invalidateQueries({ queryKey: TAGS_KEY }),
    [qc]
  );

  function openCreate() {
    setEditing(null);
    setServerErrorKey(null);
    setFormOpen(true);
  }

  function openEdit(tag: Tag) {
    setEditing(tag);
    setServerErrorKey(null);
    setFormOpen(true);
  }

  async function handleSubmit(values: TagFormValues) {
    try {
      if (editing) {
        await settingsApi.updateTag(role, { id: editing.id, ...values });
        toast({ tone: "success", title: t("updated", { label: values.label }) });
      } else {
        await settingsApi.createTag(role, values);
        toast({ tone: "success", title: t("created", { label: values.label }) });
      }
      await refresh();
      setFormOpen(false);
    } catch (err) {
      if (err instanceof SettingsError && err.detailKey) {
        setServerErrorKey(err.detailKey);
        return;
      }
      toast({ tone: "destructive", title: tErr("saveFailed") });
    }
  }

  function requestDelete(tag: Tag) {
    setTarget(tag);
    setConfirmOpen(true);
  }

  async function handleDelete() {
    if (!target) return;
    const removed = target;
    await settingsApi.deleteTag(role, removed.id);
    await refresh();
    toastWithUndo({
      tone: "destructive",
      title: t("deleted", { label: removed.label }),
      onUndo: async () => {
        await settingsApi.restoreTag(role, removed);
        await refresh();
        toast({ tone: "success", title: t("restored", { label: removed.label }) });
      },
    });
  }

  const columns: SmartTableColumn<Tag>[] = [
    {
      id: "label",
      header: t("columns.label"),
      accessor: (r) => r.label,
      sortable: true,
      cardPriority: 0,
      cell: (r) => <ColorChip color={r.color}>{r.label}</ColorChip>,
    },
    {
      id: "usage",
      header: t("columns.usage"),
      accessor: (r) => r.usageCount,
      sortable: true,
      align: "right",
      cardPriority: 1,
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {t("usageValue", { count: r.usageCount })}
        </span>
      ),
    },
  ];

  const tags = query.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden />
            <span className="hidden sm:inline">{t("createAction")}</span>
            <span className="sm:hidden">{t("createShort")}</span>
          </Button>
        }
      />

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
      ) : (
        <SmartTable
          data={tags}
          columns={columns}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          searchPlaceholder={t("searchPlaceholder")}
          emptyIcon={TagsIcon}
          emptyTitle={t("emptyTitle")}
          emptyDescription={t("emptyDescription")}
          rowActions={(row) => [
            { label: t("actions.edit"), icon: Pencil, onSelect: () => openEdit(row) },
            {
              label: t("actions.delete"),
              icon: Trash2,
              variant: "destructive",
              onSelect: () => requestDelete(row),
            },
          ]}
        />
      )}

      <TagFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        tag={editing}
        onSubmit={handleSubmit}
        serverErrorKey={serverErrorKey}
        onClearServerError={() => setServerErrorKey(null)}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant="destructive"
        title={t("deleteConfirm.title")}
        description={
          target && target.usageCount > 0
            ? t("deleteConfirm.descriptionInUse", { label: target.label, count: target.usageCount })
            : t("deleteConfirm.description", { label: target?.label ?? "" })
        }
        confirmLabel={t("actions.delete")}
        onConfirm={handleDelete}
      />
    </div>
  );
}
