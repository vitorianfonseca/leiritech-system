"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Eye,
  Plus,
  RefreshCw,
  TriangleAlert,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import {
  SmartTable,
  EmptyState,
  toastWithUndo,
  toast,
  type SmartTableColumn,
  type RowAction,
} from "@/components/shared";
import { canAccessFinance } from "@/lib/api/finance-types";
import { crmRoutes } from "@/lib/api/crm";
import {
  proposalsApi,
  proposalRoutes,
  proposalStateOptions,
} from "@/lib/api/proposals";
import {
  ProposalError,
  canArchive,
  type Proposal,
} from "@/lib/api/proposals-types";
import type { Role } from "@/lib/session";
import { ProposalStateBadge } from "./status-badge";
import { CreateProposalDialog } from "./create-proposal-dialog";
import { formatEUR, formatDate } from "./proposal-format";

export interface ProposalsViewProps {
  user: { role: Role; userId: string; paymentsGrant: boolean };
}

/**
 * /crm/proposals — proposals directory (F6). Gestor+/Admin only (BR-002). A
 * SmartTable with search / state filter / sort / pagination, plus quick-create.
 * Value is finance-gated (BR-008). Non-accepted proposals can be archived with
 * undo (BR-028); accepted ones cannot.
 */
export function ProposalsView({ user }: ProposalsViewProps) {
  const t = useTranslations("proposals.list");
  const tStates = useTranslations("proposals.states");
  const tErr = useTranslations("proposals.errors");
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const canFinance = canAccessFinance(user.role, user.paymentsGrant);

  const [createOpen, setCreateOpen] = React.useState(false);

  const queryKey = ["proposals", "list", user.role, user.userId, user.paymentsGrant] as const;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      proposalsApi.listProposals({
        role: user.role,
        userId: user.userId,
        paymentsGrant: user.paymentsGrant,
      }),
  });

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["proposals"] });
  }, [qc]);

  const archive = React.useCallback(
    async (p: Proposal) => {
      try {
        await proposalsApi.archiveProposal(p.id, user.userId);
        refresh();
        toastWithUndo({
          title: t("archivedToast", { reference: p.reference }),
          onUndo: async () => {
            await proposalsApi.restoreProposal(p.id, user.userId);
            refresh();
          },
        });
      } catch (error) {
        const code = error instanceof ProposalError ? error.code : "invalid_transition";
        toast({ tone: "destructive", title: tErr(code) });
      }
    },
    [refresh, t, tErr, user.userId]
  );

  const columns: SmartTableColumn<Proposal>[] = React.useMemo(
    () => [
      {
        id: "reference",
        header: t("columns.reference"),
        accessor: (p) => p.reference,
        sortable: true,
        cardPriority: 0,
        cell: (p) => (
          <span className="font-mono text-sm font-medium text-foreground">{p.reference}</span>
        ),
      },
      {
        id: "opportunity",
        header: t("columns.opportunity"),
        accessor: (p) => p.opportunityTitle,
        sortable: true,
        cardPriority: 1,
        cell: (p) => (
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">{p.opportunityTitle}</p>
            <Link
              href={crmRoutes.company(p.companyId)}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-xs text-signal hover:underline"
            >
              {p.companyName}
            </Link>
          </div>
        ),
      },
      {
        id: "state",
        header: t("columns.state"),
        accessor: (p) => p.state,
        sortable: true,
        cardPriority: 2,
        filterOptions: proposalStateOptions().map((s) => ({ value: s, label: tStates(s) })),
        cell: (p) => <ProposalStateBadge state={p.state} />,
      },
      {
        id: "value",
        header: t("columns.value"),
        accessor: (p) => p.valueCents ?? -1,
        sortable: true,
        align: "right",
        cardPriority: 3,
        cell: (p) =>
          p.valueCents != null ? (
            <span className="font-heading text-sm font-semibold tabular-nums">
              {formatEUR(p.valueCents, locale)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{t("valueRestricted")}</span>
          ),
      },
      {
        id: "sentAt",
        header: t("columns.sentAt"),
        accessor: (p) => p.sentAt ?? "",
        sortable: true,
        cell: (p) => (
          <span className="text-sm text-muted-foreground">
            {p.sentAt ? formatDate(p.sentAt) : "—"}
          </span>
        ),
      },
      {
        id: "validUntil",
        header: t("columns.validUntil"),
        accessor: (p) => p.validUntil ?? "",
        sortable: true,
        defaultHidden: true,
        cell: (p) => (
          <span className="text-sm text-muted-foreground">
            {p.validUntil ? formatDate(p.validUntil) : "—"}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: t("columns.createdAt"),
        accessor: (p) => p.createdAt,
        sortable: true,
        defaultHidden: true,
        cell: (p) => (
          <span className="text-sm text-muted-foreground">{formatDate(p.createdAt.slice(0, 10))}</span>
        ),
      },
    ],
    [t, tStates, locale]
  );

  const rowActions = React.useCallback(
    (p: Proposal): RowAction<Proposal>[] => {
      const actions: RowAction<Proposal>[] = [
        { label: t("actions.view"), icon: Eye, onSelect: (r) => router.push(proposalRoutes.detail(r.id)) },
      ];
      if (canArchive(p)) {
        actions.push({
          label: t("actions.archive"),
          icon: Archive,
          onSelect: (r) => archive(r),
        });
      }
      return actions;
    },
    [router, t, archive]
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
          <Button size="lg" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            {t("new")}
          </Button>
        }
      />
      <SmartTable
        data={data ?? []}
        columns={columns}
        getRowId={(p) => p.id}
        loading={isLoading}
        searchPlaceholder={t("searchPlaceholder")}
        onRowClick={(p) => router.push(proposalRoutes.detail(p.id))}
        rowActions={rowActions}
        emptyIcon={FileText}
        emptyTitle={t("empty.title")}
        emptyDescription={t("empty.description")}
      />

      <CreateProposalDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        user={user}
        canFinance={canFinance}
        onConfirm={async (input, templateId) => {
          const created = await proposalsApi.createProposal(input, user.userId, canFinance);
          if (templateId) {
            await proposalsApi.applyTemplate(created.id, templateId);
          }
          refresh();
          toast({ tone: "success", title: t("createdToast", { reference: created.reference }) });
          router.push(proposalRoutes.detail(created.id));
        }}
      />
    </div>
  );
}
