"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, TriangleAlert, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, SkeletonList, toast } from "@/components/shared";
import { settingsApi } from "@/lib/api/settings";
import type { ExportDataset } from "@/lib/api/settings-types";

export function ExportSettingsView() {
  const t = useTranslations("settings.export");
  const tErr = useTranslations("settings.export.errors");

  const query = useQuery({
    queryKey: ["settings-export"],
    queryFn: () => settingsApi.listExportDatasets(),
  });

  const [busy, setBusy] = React.useState<string | null>(null);

  function download(dataset: ExportDataset) {
    setBusy(dataset.id);
    try {
      // Mock export: real backend streams the dataset; here we emit a valid CSV
      // with the column headers + a sample row so the action is never a dead end.
      const header = dataset.columns.join(",");
      const sample = dataset.columns.map(() => "—").join(",");
      const csv = `${header}\n${sample}\n`;
      const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aurea-${dataset.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ tone: "success", title: t("exported", { dataset: t(`datasets.${dataset.id}`) }) });
    } catch {
      toast({ tone: "destructive", title: tErr("failed") });
    } finally {
      setBusy(null);
    }
  }

  const datasets = query.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
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
        <ul className="grid gap-3 sm:grid-cols-2">
          {datasets.map((dataset) => (
            <li
              key={dataset.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold-muted text-gold">
                  <FileSpreadsheet className="size-5" strokeWidth={1.8} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{t(`datasets.${dataset.id}`)}</p>
                  <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                    {t("rowCount", { rows: dataset.rowCount })}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => download(dataset)}
                disabled={busy === dataset.id}
              >
                <Download aria-hidden />
                {busy === dataset.id ? t("exporting") : t("exportAction")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
