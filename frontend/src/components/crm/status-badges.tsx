"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  CircleDot,
  CheckCircle2,
  PauseCircle,
  Handshake,
  Archive,
  Star,
  Search,
  Compass,
  FileText,
  Scale,
  Trophy,
  XCircle,
  CircleDashed,
  Send,
  ThumbsDown,
  Clock,
  ClipboardList,
  PlayCircle,
  Ban,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  CompanyStatus,
  ContactStatus,
  OpportunityStage,
  ProjectHealth,
  ProjectRefStatus,
  ProposalStatus,
} from "@/lib/api/crm-types";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const COMPANY_META: Record<CompanyStatus, { variant: BadgeVariant; icon: LucideIcon }> = {
  potencial: { variant: "info", icon: CircleDot },
  ativo: { variant: "success", icon: CheckCircle2 },
  inativo: { variant: "done", icon: PauseCircle },
  parceiro: { variant: "signal", icon: Handshake },
  arquivada: { variant: "done", icon: Archive },
};

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  const t = useTranslations("crm.status.company");
  const meta = COMPANY_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon aria-hidden />
      {t(status)}
    </Badge>
  );
}

/** Derived "cliente ativo" flag (BR-038). */
export function ClienteAtivoBadge() {
  const t = useTranslations("crm");
  return (
    <Badge variant="signal">
      <Star aria-hidden />
      {t("clienteAtivo")}
    </Badge>
  );
}

const CONTACT_META: Record<ContactStatus, { variant: BadgeVariant; icon: LucideIcon }> = {
  active: { variant: "success", icon: CheckCircle2 },
  inactive: { variant: "done", icon: PauseCircle },
};

export function ContactStatusBadge({ status }: { status: ContactStatus }) {
  const t = useTranslations("crm.status.contact");
  const meta = CONTACT_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon aria-hidden />
      {t(status)}
    </Badge>
  );
}

const OPPORTUNITY_META: Record<OpportunityStage, { variant: BadgeVariant; icon: LucideIcon }> = {
  qualification: { variant: "default", icon: Search },
  discovery: { variant: "info", icon: Compass },
  proposal: { variant: "info", icon: FileText },
  negotiation: { variant: "warning", icon: Scale },
  won: { variant: "success", icon: Trophy },
  lost: { variant: "destructive", icon: XCircle },
};

export function OpportunityStageBadge({ stage }: { stage: OpportunityStage }) {
  const t = useTranslations("crm.status.opportunity");
  const meta = OPPORTUNITY_META[stage];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon aria-hidden />
      {t(stage)}
    </Badge>
  );
}

const PROPOSAL_META: Record<ProposalStatus, { variant: BadgeVariant; icon: LucideIcon }> = {
  draft: { variant: "default", icon: CircleDashed },
  sent: { variant: "info", icon: Send },
  accepted: { variant: "success", icon: CheckCircle2 },
  rejected: { variant: "destructive", icon: ThumbsDown },
  expired: { variant: "done", icon: Clock },
};

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  const t = useTranslations("crm.status.proposal");
  const meta = PROPOSAL_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon aria-hidden />
      {t(status)}
    </Badge>
  );
}

const PROJECT_META: Record<ProjectRefStatus, { variant: BadgeVariant; icon: LucideIcon }> = {
  planning: { variant: "default", icon: ClipboardList },
  active: { variant: "info", icon: PlayCircle },
  on_hold: { variant: "warning", icon: PauseCircle },
  completed: { variant: "success", icon: CheckCircle2 },
  cancelled: { variant: "destructive", icon: Ban },
  archived: { variant: "done", icon: Archive },
};

export function ProjectStatusBadge({ status }: { status: ProjectRefStatus }) {
  const t = useTranslations("crm.status.project");
  const meta = PROJECT_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon aria-hidden />
      {t(status)}
    </Badge>
  );
}

const HEALTH_VARIANT: Record<ProjectHealth, BadgeVariant> = {
  healthy: "healthy",
  attention: "attention",
  at_risk: "atRisk",
};

export function ProjectHealthBadge({ health }: { health: ProjectHealth }) {
  const t = useTranslations("crm.status.health");
  return <Badge variant={HEALTH_VARIANT[health]}>{t(health)}</Badge>;
}
