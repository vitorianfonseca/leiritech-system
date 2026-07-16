"use client";

import { useTranslations } from "next-intl";
import {
  FileEdit,
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProposalState } from "@/lib/api/proposals-types";
import { PROPOSAL_STATE_VARIANT } from "./proposal-format";

const STATE_ICON: Record<ProposalState, LucideIcon> = {
  draft: FileEdit,
  sent: Send,
  viewed: Eye,
  accepted: CheckCircle2,
  rejected: XCircle,
  expired: Clock,
};

/**
 * Proposal lifecycle badge. State is conveyed by icon + label + colour together
 * (never colour alone — WCAG AA), using the DESIGN.md status-zone Badge variants.
 */
export function ProposalStateBadge({ state }: { state: ProposalState }) {
  const t = useTranslations("proposals.states");
  const Icon = STATE_ICON[state];
  return (
    <Badge variant={PROPOSAL_STATE_VARIANT[state]}>
      <Icon strokeWidth={1.8} aria-hidden />
      {t(state)}
    </Badge>
  );
}
