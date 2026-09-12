"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "@base-ui/react/tabs";
import {
  ArrowLeft,
  Pencil,
  Archive,
  RotateCcw,
  Building2,
  TriangleAlert,
  RefreshCw,
  Info,
  Users,
  GitBranch,
  FileText,
  FolderKanban,
  CalendarDays,
  MessagesSquare,
  StickyNote,
  Paperclip,
  Wallet,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  ActivityFeed,
  CommentThread,
  EmptyState,
  SkeletonCard,
  toast,
  type ComboboxItem,
} from "@/components/shared";
import { cn } from "@/lib/utils";
import { crmApi, crmCollaborationApi } from "@/lib/api/crm";
import { CrmError, type CompanyInput } from "@/lib/api/crm-types";
import type { Role } from "@/lib/session";
import { CompanyStatusBadge, ClienteAtivoBadge } from "./status-badges";
import { QuickActions } from "./quick-actions";
import { CompanyFormDialog } from "./company-form-dialog";
import { ArchiveCompanyDialog } from "./archive-company-dialog";
import { InteractionsTab } from "./interactions-tab";
import {
  ContactsList,
  OpportunitiesList,
  ProposalsList,
  ProjectsList,
  MeetingsList,
  FilesList,
  PaymentsList,
} from "./company-related-lists";
import { InformationTab } from "./information-tab";
import { formatDate, initials } from "./crm-format";

export interface CompanyDetailViewProps {
  companyId: string;
  user: {
    role: Role;
    userId: string;
    paymentsGrant: boolean;
    name: string;
    avatarUrl: string | null;
  };
}

export function CompanyDetailView({ companyId, user }: CompanyDetailViewProps) {
  const t = useTranslations("crm.detail");
  const tTabs = useTranslations("crm.tabs");
  const qc = useQueryClient();
  const canManage = user.role !== "membro";

  const queryKey = ["crm", "company", companyId, user.role, user.userId, user.paymentsGrant] as const;
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => crmApi.getCompany(companyId, user.role, user.userId, user.paymentsGrant),
    retry: (count, err) => !(err instanceof CrmError) && count < 1,
  });

  const [tab, setTab] = React.useState("information");
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["crm"] });
  }, [qc]);

  const handleUpdate = React.useCallback(
    async (input: CompanyInput) => {
      await crmApi.updateCompany(companyId, input, user.userId);
      refresh();
      toast({ tone: "success", title: t("toastUpdated") });
    },
    [companyId, refresh, t, user.userId]
  );

  /* ---------------- loading / not-found / error ---------------- */

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="flex items-center gap-4">
          <div className="size-14 animate-pulse rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-7 w-56 animate-pulse rounded bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <SkeletonCard />
      </div>
    );
  }

  if (isError) {
    const notFound = error instanceof CrmError && error.code === "not_found";
    return (
      <div className="space-y-6">
        <BackLink label={t("back")} />
        <EmptyState
          icon={notFound ? Building2 : TriangleAlert}
          title={notFound ? t("notFoundTitle") : t("errorTitle")}
          description={notFound ? t("notFoundDescription") : t("errorDescription")}
          action={
            notFound ? (
              <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/crm/companies" />}>
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

  const company = data;
  const isArchived = company.archivedAt !== null;

  const contactOptions: ComboboxItem[] = company.contacts.map((c) => ({ value: c.id, label: c.name }));
  const opportunityOptions: ComboboxItem[] = company.opportunities.map((o) => ({ value: o.id, label: o.title }));
  const projectOptions: ComboboxItem[] = company.projects.map((p) => ({ value: p.id, label: p.name }));

  const tabItems: Array<{ value: string; label: string; icon: typeof Info; count?: number }> = [
    { value: "information", label: tTabs("information.label"), icon: Info },
    { value: "contacts", label: tTabs("contacts.label"), icon: Users, count: company.contacts.length },
    { value: "opportunities", label: tTabs("opportunities.label"), icon: GitBranch, count: company.opportunities.length },
    { value: "proposals", label: tTabs("proposals.label"), icon: FileText, count: company.proposals.length },
    { value: "projects", label: tTabs("projects.label"), icon: FolderKanban, count: company.projects.length },
    { value: "meetings", label: tTabs("meetings.label"), icon: CalendarDays, count: company.meetings.length },
    { value: "interactions", label: tTabs("interactions.label"), icon: MessagesSquare },
    { value: "notes", label: tTabs("notes.label"), icon: StickyNote },
    { value: "files", label: tTabs("files.label"), icon: Paperclip, count: company.files.length },
    ...(company.canSeeFinancials
      ? [{ value: "payments", label: tTabs("payments.label"), icon: Wallet, count: company.payments.length }]
      : []),
    { value: "timeline", label: tTabs("timeline.label"), icon: History },
  ];

  return (
    <div className="space-y-6">
      <BackLink label={t("back")} />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="size-14 shrink-0">
            <AvatarFallback className="font-heading text-lg">{initials(company.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {company.name}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <CompanyStatusBadge status={company.status} />
              {company.clienteAtivo ? <ClienteAtivoBadge /> : null}
              <span className="text-sm text-muted-foreground">· {company.sector}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("ownedBy", { name: company.ownerName })}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <QuickActions email={company.email} phone={company.phone} website={company.website} size="sm" />
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
                await crmApi.restoreCompany(company.id, user.userId);
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
          {t("archivedBanner", { date: company.archivedAt ? formatDate(company.archivedAt) : "" })}
        </div>
      ) : null}

      {/* Tabs */}
      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as string)}>
        <div className="overflow-x-auto">
          <Tabs.List className="flex min-w-max gap-1 border-b border-border">
            {tabItems.map((item) => {
              const Icon = item.icon;
              return (
                <Tabs.Tab
                  key={item.value}
                  value={item.value}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors",
                    "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    "data-[selected]:border-signal data-[selected]:text-foreground"
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} aria-hidden />
                  {item.label}
                  {item.count != null && item.count > 0 ? (
                    <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[0.6875rem] font-semibold tabular-nums text-muted-foreground">
                      {item.count}
                    </span>
                  ) : null}
                </Tabs.Tab>
              );
            })}
          </Tabs.List>
        </div>

        <div className="pt-6">
          <Tabs.Panel value="information">
            <InformationTab company={company} />
          </Tabs.Panel>
          <Tabs.Panel value="contacts">
            <ContactsList contacts={company.contacts} />
          </Tabs.Panel>
          <Tabs.Panel value="opportunities">
            <OpportunitiesList opportunities={company.opportunities} canFinance={company.canSeeFinancials} />
          </Tabs.Panel>
          <Tabs.Panel value="proposals">
            <ProposalsList proposals={company.proposals} canFinance={company.canSeeFinancials} />
          </Tabs.Panel>
          <Tabs.Panel value="projects">
            <ProjectsList projects={company.projects} />
          </Tabs.Panel>
          <Tabs.Panel value="meetings">
            <MeetingsList meetings={company.meetings} />
          </Tabs.Panel>
          <Tabs.Panel value="interactions">
            <InteractionsTab
              companyId={company.id}
              authorId={user.userId}
              canLog={canManage && !isArchived}
              contacts={contactOptions}
              opportunities={opportunityOptions}
              projects={projectOptions}
            />
          </Tabs.Panel>
          <Tabs.Panel value="notes">
            <Card>
              <CardContent className="pt-6">
                <CommentThread
                  entityType="company"
                  entityId={company.id}
                  api={crmCollaborationApi}
                  currentUser={
                    isArchived
                      ? undefined
                      : { id: user.userId, name: user.name, avatarUrl: user.avatarUrl }
                  }
                />
              </CardContent>
            </Card>
          </Tabs.Panel>
          <Tabs.Panel value="files">
            <FilesList files={company.files} />
          </Tabs.Panel>
          {company.canSeeFinancials ? (
            <Tabs.Panel value="payments">
              <PaymentsList payments={company.payments} />
            </Tabs.Panel>
          ) : null}
          <Tabs.Panel value="timeline">
            <Card>
              <CardContent className="pt-6">
                <ActivityFeed entityType="company" entityId={company.id} api={crmCollaborationApi} />
              </CardContent>
            </Card>
          </Tabs.Panel>
        </div>
      </Tabs.Root>

      {canManage ? (
        <>
          <CompanyFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            company={company}
            onSubmit={handleUpdate}
          />
          <ArchiveCompanyDialog
            open={archiveOpen}
            onOpenChange={setArchiveOpen}
            company={{ id: company.id, name: company.name }}
            actorId={user.userId}
            onChanged={refresh}
          />
        </>
      ) : null}
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/crm/companies"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
      {label}
    </Link>
  );
}
