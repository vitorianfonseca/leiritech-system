"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Eye, Pencil, Archive, RotateCcw, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shell/page-header";
import {
  SmartTable,
  EmptyState,
  ConfirmDialog,
  toast,
  toastWithUndo,
  type SmartTableColumn,
  type RowAction,
} from "@/components/shared";
import { crmApi, crmRoutes } from "@/lib/api/crm";
import type { Contact, ContactInput } from "@/lib/api/crm-types";
import type { Role } from "@/lib/session";
import { ContactStatusBadge } from "./status-badges";
import { ContactFormDialog } from "./contact-form-dialog";
import { QuickActions } from "./quick-actions";
import { formatDate, initials } from "./crm-format";

export interface ContactsViewProps {
  user: { role: Role; userId: string; paymentsGrant: boolean };
}

export function ContactsView({ user }: ContactsViewProps) {
  const t = useTranslations("crm.contacts");
  const tStatus = useTranslations("crm.status.contact");
  const router = useRouter();
  const qc = useQueryClient();

  const canManage = user.role !== "membro";
  const [includeArchived, setIncludeArchived] = React.useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["crm", "contacts", user.role, user.userId, includeArchived],
    queryFn: () =>
      crmApi.listContacts({
        role: user.role,
        userId: user.userId,
        paymentsGrant: user.paymentsGrant,
        includeArchived,
      }),
  });

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["crm"] });
  }, [qc]);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Contact | null>(null);
  const [archiving, setArchiving] = React.useState<Contact | null>(null);

  const handleCreate = React.useCallback(
    async (input: ContactInput) => {
      const created = await crmApi.createContact(input, user.userId);
      refresh();
      toast({ tone: "success", title: t("toasts.created", { name: created.name }) });
      router.push(crmRoutes.contact(created.id));
    },
    [refresh, router, t, user.userId]
  );

  const handleUpdate = React.useCallback(
    async (input: ContactInput) => {
      if (!editing) return;
      await crmApi.updateContact(editing.id, input, user.userId);
      refresh();
      toast({ tone: "success", title: t("toasts.updated", { name: input.name }) });
    },
    [editing, refresh, t, user.userId]
  );

  const columns: SmartTableColumn<Contact>[] = React.useMemo(
    () => [
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
              <p className="truncate text-xs text-muted-foreground">{c.role ?? "—"}</p>
            </div>
          </div>
        ),
      },
      {
        id: "company",
        header: t("columns.company"),
        accessor: (c) => c.companyName,
        sortable: true,
        cardPriority: 1,
        cell: (c) => (
          <Link
            href={crmRoutes.company(c.companyId)}
            onClick={(e) => e.stopPropagation()}
            className="text-sm text-signal hover:underline"
          >
            {c.companyName}
          </Link>
        ),
      },
      {
        id: "status",
        header: t("columns.status"),
        accessor: (c) => c.status,
        sortable: true,
        cardPriority: 2,
        filterOptions: (["active", "inactive"] as const).map((s) => ({ value: s, label: tStatus(s) })),
        cell: (c) => <ContactStatusBadge status={c.status} />,
      },
      {
        id: "owner",
        header: t("columns.owner"),
        accessor: (c) => c.ownerName,
        sortable: true,
        defaultHidden: true,
        cell: (c) => <span className="text-sm">{c.ownerName}</span>,
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
      },
    ],
    [t, tStatus]
  );

  const rowActions = React.useCallback(
    (c: Contact): RowAction<Contact>[] => {
      const actions: RowAction<Contact>[] = [
        { label: t("actions.view"), icon: Eye, onSelect: (r) => router.push(crmRoutes.contact(r.id)) },
      ];
      if (canManage) {
        if (c.archivedAt) {
          actions.push({
            label: t("actions.restore"),
            icon: RotateCcw,
            onSelect: async (r) => {
              await crmApi.restoreContact(r.id, user.userId);
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
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              {t("actions.new")}
            </Button>
          ) : null
        }
      />
      <SmartTable
        data={data ?? []}
        columns={columns}
        getRowId={(c) => c.id}
        loading={isLoading}
        searchPlaceholder={t("searchPlaceholder")}
        onRowClick={(c) => router.push(crmRoutes.contact(c.id))}
        rowActions={rowActions}
        emptyIcon={Users}
        emptyTitle={t("empty.title")}
        emptyDescription={t("empty.description")}
        toolbar={
          canManage ? (
            <Button
              variant="outline"
              size="sm"
              aria-pressed={includeArchived}
              onClick={() => setIncludeArchived((v) => !v)}
            >
              <Archive aria-hidden />
              {includeArchived ? t("actions.hideArchived") : t("actions.showArchived")}
            </Button>
          ) : undefined
        }
      />

      {canManage ? (
        <>
          <ContactFormDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            contact={null}
            user={user}
            onSubmit={handleCreate}
          />
          <ContactFormDialog
            open={editing !== null}
            onOpenChange={(open) => {
              if (!open) setEditing(null);
            }}
            contact={editing}
            user={user}
            onSubmit={handleUpdate}
          />
          <ConfirmDialog
            open={archiving !== null}
            onOpenChange={(open) => {
              if (!open) setArchiving(null);
            }}
            title={t("archiveConfirm.title")}
            description={t("archiveConfirm.description", { name: archiving?.name ?? "" })}
            confirmLabel={t("actions.archive")}
            onConfirm={async () => {
              if (!archiving) return;
              const target = archiving;
              await crmApi.archiveContact(target.id, user.userId);
              refresh();
              toastWithUndo({
                title: t("toasts.archived", { name: target.name }),
                onUndo: async () => {
                  await crmApi.restoreContact(target.id, user.userId);
                  refresh();
                },
              });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
