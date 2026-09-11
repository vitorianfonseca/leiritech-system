"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  TriangleAlert,
  RefreshCw,
  Users,
  CalendarClock,
  History,
  Pencil,
  Archive,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, SkeletonCard, ConfirmDialog, toast } from "@/components/shared";
import { crmApi, crmRoutes } from "@/lib/api/crm";
import { CrmError, type ContactInput } from "@/lib/api/crm-types";
import type { Role } from "@/lib/session";
import { ContactStatusBadge } from "./status-badges";
import { ContactFormDialog } from "./contact-form-dialog";
import { QuickActions } from "./quick-actions";
import { formatDate, formatDateTime, initials } from "./crm-format";

export interface ContactDetailViewProps {
  contactId: string;
  user: { role: Role; userId: string; paymentsGrant: boolean };
}

export function ContactDetailView({ contactId, user }: ContactDetailViewProps) {
  const t = useTranslations("crm.contactDetail");
  const tType = useTranslations("crm.interactionType");
  const locale = useLocale();
  const qc = useQueryClient();
  const canManage = user.role !== "membro";

  const queryKey = ["crm", "contact", contactId, user.role, user.userId] as const;
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => crmApi.getContact(contactId, user.role, user.userId),
    retry: (count, err) => !(err instanceof CrmError) && count < 1,
  });

  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["crm"] });
  }, [qc]);

  const handleUpdate = React.useCallback(
    async (input: ContactInput) => {
      await crmApi.updateContact(contactId, input, user.userId);
      refresh();
      toast({ tone: "success", title: t("toastUpdated") });
    },
    [contactId, refresh, t, user.userId]
  );

  const back = (
    <Link
      href="/crm/contacts"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
      {t("back")}
    </Link>
  );

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <SkeletonCard />
      </div>
    );
  }

  if (isError) {
    const notFound = error instanceof CrmError && error.code === "not_found";
    return (
      <div className="space-y-6">
        {back}
        <EmptyState
          icon={notFound ? Users : TriangleAlert}
          title={notFound ? t("notFoundTitle") : t("errorTitle")}
          description={notFound ? t("notFoundDescription") : t("errorDescription")}
          action={
            notFound ? (
              <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/crm/contacts" />}>
                {t("backToList")}
              </Button>
            ) : (
              <Button variant="outline" size="lg" onClick={() => refetch()}>
                <RefreshCw aria-hidden />
                {t("retry")}
              </Button>
            )
          }
        />
      </div>
    );
  }

  const { contact, interactions } = data;
  const isArchived = contact.archivedAt !== null;

  const rows: Array<[string, React.ReactNode]> = [
    [
      t("email"),
      contact.email ? (
        <a href={`mailto:${contact.email}`} className="text-gold hover:underline">
          {contact.email}
        </a>
      ) : (
        "—"
      ),
    ],
    [t("phone"), contact.phone ?? "—"],
    [t("owner"), contact.ownerName],
    [t("lastInteraction"), contact.lastInteractionAt ? formatDate(contact.lastInteractionAt) : "—"],
  ];

  return (
    <div className="space-y-6">
      {back}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="size-14 shrink-0">
            <AvatarFallback className="font-heading text-lg">{initials(contact.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {contact.name}
            </h1>
            <p className="text-sm text-muted-foreground">{contact.role ?? "—"}</p>
            <div className="flex flex-wrap items-center gap-2">
              <ContactStatusBadge status={contact.status} />
              <Link
                href={crmRoutes.company(contact.companyId)}
                className="inline-flex items-center gap-1 text-sm text-gold hover:underline"
              >
                <Building2 className="size-3.5" strokeWidth={1.8} aria-hidden />
                {contact.companyName}
              </Link>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <QuickActions email={contact.email} phone={contact.phone} website={contact.website} size="sm" />
          {canManage && !isArchived ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden />
                {t("edit")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
                <Archive aria-hidden />
                {t("archive")}
              </Button>
            </>
          ) : null}
          {canManage && isArchived ? (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await crmApi.restoreContact(contact.id, user.userId);
                refresh();
                toast({ tone: "success", title: t("toastRestored") });
              }}
            >
              <RotateCcw aria-hidden />
              {t("restore")}
            </Button>
          ) : null}
        </div>
      </div>

      {isArchived ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-border bg-status-done-bg px-4 py-3 text-sm text-status-done"
        >
          <Archive className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
          {t("archivedBanner", { date: contact.archivedAt ? formatDate(contact.archivedAt) : "" })}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                {rows.map(([label, value], i) => (
                  <div key={i} className="space-y-0.5">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="text-sm text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
              {contact.notes ? (
                <div className="mt-4 space-y-1 border-t border-border pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("notes")}
                  </p>
                  <p className="text-sm text-foreground">{contact.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 pt-6">
              <h2 className="flex items-center gap-2 font-heading text-sm font-semibold text-foreground">
                <History className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                {t("interactions")}
              </h2>
              {interactions.length === 0 ? (
                <EmptyState
                  icon={History}
                  title={t("noInteractionsTitle")}
                  description={t("noInteractionsDescription")}
                />
              ) : (
                <ul className="space-y-3">
                  {interactions.map((it) => (
                    <li key={it.id} className="rounded-lg border border-border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {tType(it.type)}
                        </span>
                        <span className="text-sm font-medium text-foreground">{it.subject}</span>
                      </div>
                      {it.body ? <p className="mt-1 text-sm text-muted-foreground">{it.body}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {it.authorName} · {formatDateTime(it.occurredAt, locale)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardContent className="space-y-1.5 pt-6">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <CalendarClock className="size-3.5" strokeWidth={1.8} aria-hidden />
                {t("nextAction")}
              </p>
              {contact.nextAction ? (
                <>
                  <p className="text-sm font-medium text-foreground">{contact.nextAction}</p>
                  {contact.nextActionAt ? (
                    <p className="text-xs text-muted-foreground">{formatDate(contact.nextActionAt)}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noNextAction")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {canManage ? (
        <>
          <ContactFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            contact={contact}
            user={{ role: user.role, userId: user.userId, paymentsGrant: user.paymentsGrant }}
            onSubmit={handleUpdate}
          />
          <ConfirmDialog
            open={archiveOpen}
            onOpenChange={setArchiveOpen}
            title={t("archiveConfirm.title")}
            description={t("archiveConfirm.description", { name: contact.name })}
            confirmLabel={t("archive")}
            onConfirm={async () => {
              await crmApi.archiveContact(contact.id, user.userId);
              refresh();
              toast({ tone: "success", title: t("toastArchived") });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
