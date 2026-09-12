"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Phone,
  Users,
  Mail,
  MessageSquare,
  StickyNote,
  CalendarClock,
  Plus,
  GitBranch,
  FolderKanban,
  User,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, SkeletonList, toast } from "@/components/shared";
import type { ComboboxItem } from "@/components/shared";
import { crmApi } from "@/lib/api/crm";
import { recordRoutes } from "@/lib/api/dashboard";
import type { Interaction, InteractionInput, InteractionType } from "@/lib/api/crm-types";
import { InteractionDialog } from "./interaction-dialog";
import { formatDateTime } from "./crm-format";

const TYPE_ICON: Record<InteractionType, LucideIcon> = {
  call: Phone,
  meeting: Users,
  email: Mail,
  message: MessageSquare,
  note: StickyNote,
  follow_up: CalendarClock,
};

export interface InteractionsTabProps {
  companyId: string;
  authorId: string;
  canLog: boolean;
  contacts: ComboboxItem[];
  opportunities: ComboboxItem[];
  projects: ComboboxItem[];
}

export function InteractionsTab({
  companyId,
  authorId,
  canLog,
  contacts,
  opportunities,
  projects,
}: InteractionsTabProps) {
  const t = useTranslations("crm.interactions");
  const tType = useTranslations("crm.interactionType");
  const locale = useLocale();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const queryKey = ["crm", "interactions", companyId] as const;
  const { data, isPending, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => crmApi.listInteractions(companyId),
  });

  const handleCreate = React.useCallback(
    async (input: InteractionInput) => {
      await crmApi.createInteraction(input);
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["collaboration", "activity", "company", companyId] });
      toast({ tone: "success", title: t("toastCreated") });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyId, qc, t]
  );

  const interactions = data ?? [];

  return (
    <section aria-label={t("title")} className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-semibold text-foreground">{t("title")}</h2>
        {canLog ? (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus aria-hidden />
            {t("logButton")}
          </Button>
        ) : null}
      </header>

      {isPending ? (
        <SkeletonList rows={4} />
      ) : isError ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive-muted/40 px-6 py-8 text-center"
        >
          <AlertTriangle className="size-6 text-destructive" strokeWidth={1.8} aria-hidden />
          <p className="text-sm font-semibold text-foreground">{t("errorTitle")}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw aria-hidden />
            {t("retry")}
          </Button>
        </div>
      ) : interactions.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            canLog ? (
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                <Plus aria-hidden />
                {t("logButton")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ol className="relative">
          {interactions.map((it, i) => (
            <InteractionRow
              key={it.id}
              interaction={it}
              isLast={i === interactions.length - 1}
              typeLabel={tType(it.type)}
              locale={locale}
            />
          ))}
        </ol>
      )}

      {canLog ? (
        <InteractionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          companyId={companyId}
          authorId={authorId}
          contacts={contacts}
          opportunities={opportunities}
          projects={projects}
          onSubmit={handleCreate}
        />
      ) : null}
    </section>
  );
}

function InteractionRow({
  interaction,
  isLast,
  typeLabel,
  locale,
}: {
  interaction: Interaction;
  isLast: boolean;
  typeLabel: string;
  locale: string;
}) {
  const t = useTranslations("crm.interactions");
  const Icon = TYPE_ICON[interaction.type];
  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {!isLast ? (
        <span className="absolute left-[15px] top-9 bottom-0 w-px bg-border" aria-hidden />
      ) : null}
      <span className="relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.8} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {typeLabel}
          </span>
          <span className="text-sm font-medium text-foreground">{interaction.subject}</span>
        </div>
        {interaction.body ? (
          <p className="mt-1 text-sm text-muted-foreground">{interaction.body}</p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <User className="size-3" strokeWidth={1.8} aria-hidden />
            {interaction.authorName}
          </span>
          <time dateTime={interaction.occurredAt}>{formatDateTime(interaction.occurredAt, locale)}</time>
          {interaction.contactName ? (
            <span className="rounded bg-muted px-1.5 py-0.5">{interaction.contactName}</span>
          ) : null}
          {interaction.opportunityId && interaction.opportunityTitle ? (
            <Link
              href={recordRoutes.opportunity(interaction.opportunityId)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-signal hover:underline"
            >
              <GitBranch className="size-3" strokeWidth={1.8} aria-hidden />
              {interaction.opportunityTitle}
            </Link>
          ) : null}
          {interaction.projectId && interaction.projectName ? (
            <Link
              href={recordRoutes.project(interaction.projectId)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-signal hover:underline"
            >
              <FolderKanban className="size-3" strokeWidth={1.8} aria-hidden />
              {interaction.projectName}
            </Link>
          ) : null}
        </div>
      </div>
      <span className="sr-only">{t("linkedLabel")}</span>
    </li>
  );
}
