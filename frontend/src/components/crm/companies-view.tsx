"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Plus,
  Eye,
  Pencil,
  Archive,
  RotateCcw,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shell/page-header";
import {
  SmartTable,
  EmptyState,
  toast,
  type SmartTableColumn,
  type RowAction,
} from "@/components/shared";
import { crmApi } from "@/lib/api/crm";
import type { CompanyInput, CompanySummary } from "@/lib/api/crm-types";
import type { Role } from "@/lib/session";
import { CompanyStatusBadge, ClienteAtivoBadge } from "./status-badges";
import { CompanyFormDialog } from "./company-form-dialog";
import { ArchiveCompanyDialog } from "./archive-company-dialog";
import { QuickActions } from "./quick-actions";
import { initials } from "./crm-format";

export interface CompaniesViewProps {
  user: { role: Role; userId: string; paymentsGrant: boolean };
}

export function CompaniesView({ user }: CompaniesViewProps) {
  const t = useTranslations("crm.companies");
  const tStatus = useTranslations("crm.status.company");
  const tSource = useTranslations("crm.source");
  const router = useRouter();
  const qc = useQueryClient();

  const canManage = user.role !== "membro";
  const [includeArchived, setIncludeArchived] = React.useState(false);

  const queryKey = React.useMemo(
    () => ["crm", "companies", user.role, user.userId, user.paymentsGrant, includeArchived] as const,
    [user.role, user.userId, user.paymentsGrant, includeArchived]
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      crmApi.listCompanies({
        role: user.role,
        userId: user.userId,
        paymentsGrant: user.paymentsGrant,
        includeArchived,
      }),
  });

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["crm"] });
  }, [qc]);

  const [editing, setEditing] = React.useState<CompanySummary | null>(null);
  const [archiving, setArchiving] = React.useState<CompanySummary | null>(null);

  const handleUpdate = React.useCallback(
    async (input: CompanyInput) => {
      if (!editing) return;
      await crmApi.updateCompany(editing.id, input, user.userId);
      refresh();
      toast({ tone: "success", title: t("toasts.updated", { name: input.name }) });
    },
    [editing, refresh, t, user.userId]
  );

  const companies = data ?? [];

  const columns: SmartTableColumn<CompanySummary>[] = React.useMemo(() => {
    const cols: SmartTableColumn<CompanySummary>[] = [
      {
        id: "name",
        header: t("columns.name"),
        accessor: (c) => c.name,
        sortable: true,
        cardPriority: 0,
        cell: (c) => (
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback className="text-[0.65rem]">{initials(c.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">{c.sector}</p>
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: t("columns.status"),
        accessor: (c) => c.status,
        sortable: true,
        cardPriority: 1,
        filterOptions: (["potencial", "ativo", "inativo", "parceiro", "arquivada"] as const).map(
          (s) => ({ value: s, label: tStatus(s) })
        ),
        cell: (c) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <CompanyStatusBadge status={c.status} />
            {c.clienteAtivo ? <ClienteAtivoBadge /> : null}
          </div>
        ),
      },
      /*
       * Columns the backend does not serve are deliberately absent, not
       * rendered empty.
       *
       * `CompanyResponse` carries no owner display name, no per-company
       * opportunity or project counts, no contracted total, no next action
       * and no last-interaction date — `lib/api/crm.ts` defaults every one of
       * them (see the INTEGRATION-GAP comments there). Rendering them meant a
       * confident "0" on every row and a blank owner on every company, which
       * is worse than an absent column: a wrong number is read as data.
       *
       * They come back the moment the API returns them; nothing else here
       * needs to change.
       */
      {
        id: "source",
        header: t("columns.source"),
        accessor: (c) => c.source,
        defaultHidden: true,
        filterOptions: (
          ["referral", "inbound", "outbound", "event", "partner", "other"] as const
        ).map((s) => ({ value: s, label: tSource(s) })),
        cell: (c) => <span className="text-sm text-muted-foreground">{tSource(c.source)}</span>,
      },
      {
        id: "contact",
        header: t("columns.contact"),
        cell: (c) => <QuickActions email={c.email} phone={c.phone} website={c.website} />,
        hideable: true,
      },
    ];

    return cols;
  }, [t, tStatus, tSource]);

  const rowActions = React.useCallback(
    (c: CompanySummary): RowAction<CompanySummary>[] => {
      const actions: RowAction<CompanySummary>[] = [
        { label: t("actions.view"), icon: Eye, onSelect: (r) => router.push(`/crm/companies/${r.id}`) },
      ];
      if (canManage) {
        if (c.archivedAt) {
          actions.push({
            label: t("actions.restore"),
            icon: RotateCcw,
            onSelect: async (r) => {
              await crmApi.restoreCompany(r.id, user.userId);
              refresh();
              toast({ tone: "success", title: t("toasts.restored", { name: r.name }) });
            },
          });
        } else {
          actions.push({ label: t("actions.edit"), icon: Pencil, onSelect: (r) => setEditing(r) });
          actions.push({
            label: t("actions.archive"),
            icon: Archive,
            variant: "destructive",
            onSelect: (r) => setArchiving(r),
          });
        }
      }
      return actions;
    },
    [canManage, refresh, router, t, user.userId]
  );

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <EmptyState
          icon={TriangleAlert}
          title={t("errors.loadTitle")}
          description={t("errors.loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => refetch()}>
              <RefreshCw aria-hidden />
              {t("errors.retry")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          canManage ? (
            <Button nativeButton={false} render={<Link href="/crm/companies/new" />}>
              <Plus aria-hidden />
              {t("actions.new")}
            </Button>
          ) : null
        }
      />

      <SmartTable
        data={companies}
        columns={columns}
        getRowId={(c) => c.id}
        loading={isLoading}
        searchPlaceholder={t("searchPlaceholder")}
        onRowClick={(c) => router.push(`/crm/companies/${c.id}`)}
        rowActions={rowActions}
        emptyIcon={Building2}
        emptyTitle={t("empty.title")}
        emptyDescription={t("empty.description")}
        toolbar={
          <Button
            variant="outline"
            size="sm"
            aria-pressed={includeArchived}
            onClick={() => setIncludeArchived((v) => !v)}
          >
            <Archive aria-hidden />
            {includeArchived ? t("actions.hideArchived") : t("actions.showArchived")}
          </Button>
        }
      />

      {canManage ? (
        <>
          <CompanyFormDialog
            open={editing !== null}
            onOpenChange={(open) => {
              if (!open) setEditing(null);
            }}
            company={editing}
            onSubmit={handleUpdate}
          />
          <ArchiveCompanyDialog
            open={archiving !== null}
            onOpenChange={(open) => {
              if (!open) setArchiving(null);
            }}
            company={archiving}
            actorId={user.userId}
            onChanged={refresh}
          />
        </>
      ) : null}
    </div>
  );
}
