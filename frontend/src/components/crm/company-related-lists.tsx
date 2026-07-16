"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Users,
  GitBranch,
  FileText,
  FolderKanban,
  CalendarDays,
  Paperclip,
  Wallet,
  ChevronRight,
  MapPin,
  ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState, ProgressBar } from "@/components/shared";
import { StatusBadge as PaymentStatusBadge } from "@/components/finance/milestone-status";
import { recordRoutes } from "@/lib/api/dashboard";
import { crmRoutes } from "@/lib/api/crm";
import type {
  Contact,
  FileRef,
  MeetingRef,
  OpportunityRef,
  PaymentRef,
  ProjectRef,
  ProposalRef,
} from "@/lib/api/crm-types";
import {
  ContactStatusBadge,
  OpportunityStageBadge,
  ProjectHealthBadge,
  ProjectStatusBadge,
  ProposalStatusBadge,
} from "./status-badges";
import { QuickActions } from "./quick-actions";
import { formatEUR, formatDate, formatDateTime, initials } from "./crm-format";

function Empty({ icon, titleKey }: { icon: LucideIcon; titleKey: string }) {
  const t = useTranslations("crm.tabs");
  return <EmptyState icon={icon} title={t(`${titleKey}.emptyTitle`)} description={t(`${titleKey}.emptyDescription`)} />;
}

function RowShell({
  href,
  children,
  external,
}: {
  href?: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className =
    "flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors";
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`${className} outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring`}
    >
      {children}
      {external ? (
        <ExternalLink className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
      ) : (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
      )}
    </Link>
  );
}

/* ---------------- Contacts ---------------- */

export function ContactsList({ contacts }: { contacts: Contact[] }) {
  if (contacts.length === 0) return <Empty icon={Users} titleKey="contacts" />;
  return (
    <ul className="space-y-2">
      {contacts.map((c) => (
        <li key={c.id}>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Avatar className="size-9">
              <AvatarFallback className="text-xs">{initials(c.name)}</AvatarFallback>
            </Avatar>
            <Link
              href={crmRoutes.contact(c.id)}
              className="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <p className="truncate font-medium text-foreground">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">{c.role ?? "—"}</p>
            </Link>
            <ContactStatusBadge status={c.status} />
            <QuickActions email={c.email} phone={c.phone} website={c.website} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Opportunities ---------------- */

export function OpportunitiesList({
  opportunities,
  canFinance,
}: {
  opportunities: OpportunityRef[];
  canFinance: boolean;
}) {
  const locale = useLocale();
  if (opportunities.length === 0) return <Empty icon={GitBranch} titleKey="opportunities" />;
  return (
    <ul className="space-y-2">
      {opportunities.map((o) => (
        <li key={o.id}>
          <RowShell href={recordRoutes.opportunity(o.id)}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <GitBranch className="size-4" strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{o.title}</p>
              <div className="mt-0.5">
                <OpportunityStageBadge stage={o.stage} />
              </div>
            </div>
            {canFinance && o.valueCents != null ? (
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {formatEUR(o.valueCents, locale)}
              </span>
            ) : null}
          </RowShell>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Proposals ---------------- */

export function ProposalsList({
  proposals,
  canFinance,
}: {
  proposals: ProposalRef[];
  canFinance: boolean;
}) {
  const t = useTranslations("crm.tabs.proposals");
  const locale = useLocale();
  if (proposals.length === 0) return <Empty icon={FileText} titleKey="proposals" />;
  return (
    <ul className="space-y-2">
      {proposals.map((p) => (
        <li key={p.id}>
          <RowShell href={recordRoutes.proposal(p.id)}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileText className="size-4" strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{p.title}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <ProposalStatusBadge status={p.status} />
                {p.validUntil ? (
                  <span className="text-xs text-muted-foreground">
                    {t("validUntil", { date: formatDate(p.validUntil) })}
                  </span>
                ) : null}
              </div>
            </div>
            {canFinance && p.valueCents != null ? (
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {formatEUR(p.valueCents, locale)}
              </span>
            ) : null}
          </RowShell>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Projects ---------------- */

export function ProjectsList({ projects }: { projects: ProjectRef[] }) {
  const t = useTranslations("crm.tabs.projects");
  if (projects.length === 0) return <Empty icon={FolderKanban} titleKey="projects" />;
  return (
    <ul className="space-y-2">
      {projects.map((p) => (
        <li key={p.id}>
          <RowShell href={recordRoutes.project(p.id)}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FolderKanban className="size-4" strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-medium text-foreground">{p.name}</p>
              <div className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={p.status} />
                <ProjectHealthBadge health={p.health} />
              </div>
              <ProgressBar
                value={p.progress}
                tone={p.health === "at_risk" ? "destructive" : p.health === "attention" ? "warning" : "success"}
                size="sm"
                label={t("progressLabel", { value: p.progress })}
              />
            </div>
          </RowShell>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Meetings (no destination route yet — no dead link) ---------------- */

export function MeetingsList({ meetings }: { meetings: MeetingRef[] }) {
  const t = useTranslations("crm.tabs.meetings");
  const locale = useLocale();
  if (meetings.length === 0) return <Empty icon={CalendarDays} titleKey="meetings" />;
  return (
    <ul className="space-y-2">
      {meetings.map((m) => (
        <li key={m.id}>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <CalendarDays className="size-4" strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-medium text-foreground">{m.title}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(m.scheduledAt, locale)}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {m.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" strokeWidth={1.8} aria-hidden />
                    {m.location}
                  </span>
                ) : null}
                {m.attendees.length ? <span>{t("attendees", { names: m.attendees.join(", ") })}</span> : null}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Files (no download route in mock phase — metadata only) ---------------- */

export function FilesList({ files }: { files: FileRef[] }) {
  const t = useTranslations("crm.tabs.files");
  const locale = useLocale();
  if (files.length === 0) return <Empty icon={Paperclip} titleKey="files" />;
  return (
    <>
      <ul className="space-y-2">
        {files.map((f) => (
          <li key={f.id}>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Paperclip className="size-4" strokeWidth={1.8} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{f.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(f.sizeBytes)} · {f.uploadedByName} · {formatDateTime(f.uploadedAt, locale)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{t("mockNote")}</p>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/* ---------------- Payments (GATED — BR-008) ---------------- */

export function PaymentsList({ payments }: { payments: PaymentRef[] }) {
  const t = useTranslations("crm.tabs.payments");
  const locale = useLocale();
  if (payments.length === 0) return <Empty icon={Wallet} titleKey="payments" />;
  return (
    <ul className="space-y-2">
      {payments.map((p) => (
        <li key={p.id}>
          <RowShell href={recordRoutes.payment(p.id)}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Wallet className="size-4" strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-medium text-foreground">{p.description}</p>
              <div className="flex flex-wrap items-center gap-2">
                <PaymentStatusBadge status={p.status} />
                <span className="text-xs text-muted-foreground">
                  {t("expected", { date: formatDate(p.expectedDate) })}
                </span>
              </div>
            </div>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {formatEUR(p.amountCents, locale)}
            </span>
          </RowShell>
        </li>
      ))}
    </ul>
  );
}
