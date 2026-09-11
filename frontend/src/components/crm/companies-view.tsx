"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
  Clock,
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
import { formatEUR, formatDate, initials } from "./crm-format";

export interface CompaniesViewProps {
  user: { role: Role; userId: string; paymentsGrant: boolean };
}

export function CompaniesView({ user }: CompaniesViewProps) {
  const t = useTranslations("crm.companies");
  const tStatus = useTranslations("crm.status.company");
  const tSource = useTranslations("crm.source");
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();

  const canManage = user.role !== "membro";
  const canFinance = user.paymentsGrant || user.role === "admin";
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
      {
        id: "owner",
        header: t("columns.owner"),
        accessor: (c) => c.ownerName,
        sortable: true,
        cardPriority: 4,
        cell: (c) => <span className="text-sm">{c.ownerName}</span>,
      },
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
        id: "opportunities",
        header: t("columns.opportunities"),
        accessor: (c) => c.openOpportunities,
        sortable: true,
        align: "right",
        cardPriority: 3,
        cell: (c) => <span className="tabular-nums">{c.openOpportunities}</span>,
      },
      {
        id: "projects",
        header: t("columns.projects"),
        accessor: (c) => c.activeProjects,
        sortable: true,
        align: "right",
        defaultHidden: true,
        cell: (c) => <span className="tabular-nums">{c.activeProjects}</span>,
      },
      {
        id: "nextAction",
        header: t("columns.nextAction"),
        accessor: (c) => c.nextAction ?? "",
        cardPriority: 2,
        cell: (c) => <NextActionCell company={c} />,
      },
      {
        id: "lastInteraction",
        header: t("columns.lastInteraction"),
        accessor: (c) => c.lastInteractionAt ?? "",
        sortable: true,
        defaultHidden: true,
        cell: (c) => (
          <span className="text-sm text-muted-foreground">
            {c.lastInteractionAt ? formatDate(c.lastInteractionAt) : "—"}
          </span>
        ),
      },
      {
        id: "contact",
        header: t("columns.contact"),
        cell: (c) => <QuickActions email={c.email} phone={c.phone} website={c.website} />,
        hideable: true,
      },
    ];

    if (canFinance) {
      cols.splice(6, 0, {
        id: "contracted",
        header: t("columns.contracted"),
        accessor: (c) => c.totalContractedCents ?? 0,
        sortable: true,
        align: "right",
        cell: (c) => (
          <span className="tabular-nums font-medium">
            {c.totalContractedCents != null ? formatEUR(c.totalContractedCents, locale) : "—"}
          </span>
        ),
      });
    }

    return cols;
  }, [t, tStatus, tSource, canFinance, locale]);

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

function NextActionCell({ company }: { company: CompanySummary }) {
  const locale = useLocale();
  if (!company.nextAction) return <span className="text-sm text-muted-foreground">—</span>;
  const overdue =
    company.nextActionAt != null &&
    new Date(company.nextActionAt) < new Date(new Date().toDateString());
  return (
    <div className="min-w-0">
      <p className="truncate text-sm text-foreground">{company.nextAction}</p>
      {company.nextActionAt ? (
        <p
          className={
            overdue
              ? "flex items-center gap-1 text-xs font-medium text-status-overdue"
              : "text-xs text-muted-foreground"
          }
        >
          {overdue ? <Clock className="size-3" strokeWidth={1.8} aria-hidden /> : null}
          {new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(
            new Date(company.nextActionAt)
          )}
        </p>
      ) : null}
    </div>
  );
}
