"use client";

import * as React from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, Archive, TriangleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shell/page-header";
import {
  SmartTable,
  EmptyState,
  ConfirmDialog,
  toast,
  type SmartTableColumn,
} from "@/components/shared";
import { settingsApi } from "@/lib/api/settings";
import type { ArchivedItem, ArchivedKind } from "@/lib/api/settings-types";
import type { Role } from "@/lib/session";

export interface ArchiveSettingsViewProps {
  role: Role;
}

const ARCHIVE_KEY = ["settings-archive"] as const;

function kindVariant(kind: ArchivedKind): "info" | "signal" | "outline" {
  return kind === "project" ? "info" : kind === "opportunity" ? "signal" : "outline";
}

export function ArchiveSettingsView({ role }: ArchiveSettingsViewProps) {
  const t = useTranslations("settings.archive");
  const tErr = useTranslations("settings.archive.errors");
  const format = useFormatter();
  const qc = useQueryClient();

  const query = useQuery({ queryKey: ARCHIVE_KEY, queryFn: () => settingsApi.listArchived() });

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [target, setTarget] = React.useState<ArchivedItem | null>(null);

  function requestRestore(item: ArchivedItem) {
    setTarget(item);
    setConfirmOpen(true);
  }

  async function handleRestore() {
    if (!target) return;
    try {
      await settingsApi.restoreArchived(role, target.id);
      await qc.invalidateQueries({ queryKey: ARCHIVE_KEY });
      toast({ tone: "success", title: t("restored", { title: target.title }) });
    } catch {
      toast({ tone: "destructive", title: tErr("saveFailed") });
    }
  }

  const columns: SmartTableColumn<ArchivedItem>[] = [
    {
      id: "title",
      header: t("columns.item"),
      accessor: (r) => r.title,
      sortable: true,
      cardPriority: 0,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{r.title}</p>
          <p className="truncate text-xs text-muted-foreground">{r.context}</p>
        </div>
      ),
    },
    {
      id: "kind",
      header: t("columns.kind"),
      accessor: (r) => r.kind,
      filterOptions: (["project", "opportunity", "task"] as ArchivedKind[]).map((k) => ({
        label: t(`kind.${k}`),
        value: k,
      })),
      cardPriority: 1,
      cell: (r) => <Badge variant={kindVariant(r.kind)}>{t(`kind.${r.kind}`)}</Badge>,
    },
    {
      id: "archivedAt",
      header: t("columns.archivedAt"),
      accessor: (r) => r.archivedAt,
      sortable: true,
      align: "right",
      cardPriority: 2,
      cell: (r) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {format.dateTime(new Date(r.archivedAt), { day: "2-digit", month: "2-digit", year: "numeric" })}
        </span>
      ),
    },
  ];

  const items = query.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

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
          data={items}
          columns={columns}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          searchPlaceholder={t("searchPlaceholder")}
          emptyIcon={Archive}
          emptyTitle={t("emptyTitle")}
          emptyDescription={t("emptyDescription")}
          rowActions={(row) => [
            { label: t("actions.restore"), icon: ArchiveRestore, onSelect: () => requestRestore(row) },
          ]}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("restoreConfirm.title")}
        description={t("restoreConfirm.description", { title: target?.title ?? "" })}
        confirmLabel={t("actions.restore")}
        onConfirm={handleRestore}
      />
    </div>
  );
}
