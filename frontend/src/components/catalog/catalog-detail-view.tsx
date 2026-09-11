"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard, EmptyState, ConfirmDialog, toast } from "@/components/shared";
import { formatEUR } from "@/components/finance/finance-format";
import { catalogApi } from "@/lib/api/catalog";
import type { CatalogItem } from "@/lib/api/catalog-types";
import { CatalogFormDialog } from "./catalog-form-dialog";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

export function CatalogDetailView({ id }: { id: string }) {
  const t = useTranslations("catalog.detail");
  const tUnits = useTranslations("catalog.units");
  const tBilling = useTranslations("catalog.billing");
  const locale = useLocale();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalog", "item", id],
    queryFn: () => catalogApi.get(id),
  });

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["catalog"] });
  }, [qc]);

  if (isLoading) return <SkeletonCard />;
  if (isError || !data) {
    return <EmptyState title={t("notFoundTitle")} description={t("notFoundDescription")} />;
  }

  const item: CatalogItem = data;

  return (
    <div className="space-y-6">
      <Link
        href="/crm/catalog"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-foreground">{item.name}</h1>
          {item.archivedAt ? <Badge variant="done">{t("archived")}</Badge> : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" onClick={() => setEditOpen(true)}>
            <Pencil aria-hidden />
            {t("edit")}
          </Button>
          {item.archivedAt ? (
            <Button
              variant="outline"
              size="lg"
              onClick={() => catalogApi.restore(item.id).then(refresh)}
            >
              <RotateCcw aria-hidden />
              {t("restore")}
            </Button>
          ) : (
            <Button variant="outline" size="lg" onClick={() => setArchiveOpen(true)}>
              <Archive aria-hidden />
              {t("archive")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
        <Field label={t("fields.unitPrice")} value={formatEUR(item.unitPrice, locale)} />
        <Field label={t("fields.taxRate")} value={`${item.taxRate}%`} />
        <Field label={t("fields.unit")} value={tUnits(item.unit)} />
        <Field label={t("fields.billingType")} value={tBilling(item.billingType)} />
        <Field label={t("fields.category")} value={item.category || "—"} />
        <Field label={t("fields.description")} value={item.description || "—"} />
      </div>

      <CatalogFormDialog
        open={editOpen}
        item={item}
        onOpenChange={setEditOpen}
        onConfirm={async (input) => {
          await catalogApi.update(item.id, input);
          refresh();
          qc.invalidateQueries({ queryKey: ["catalog", "item", id] });
          toast({ tone: "success", title: t("updatedToast") });
        }}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t("archiveConfirm.title")}
        description={t("archiveConfirm.description", { name: item.name })}
        confirmLabel={t("archive")}
        onConfirm={async () => {
          await catalogApi.archive(item.id);
          refresh();
          toast({ tone: "success", title: t("archivedToast") });
        }}
      />
    </div>
  );
}
