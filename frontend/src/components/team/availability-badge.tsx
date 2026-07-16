"use client";

import { useTranslations } from "next-intl";
import { CircleCheck, Scale, TriangleAlert, Palmtree } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  availabilityBadgeVariant,
  type AvailabilityState,
} from "@/lib/api/team-types";

const ICONS: Record<AvailabilityState, LucideIcon> = {
  disponivel: CircleCheck,
  equilibrado: Scale,
  sobrecarregado: TriangleAlert,
  ausente: Palmtree,
};

export interface AvailabilityBadgeProps {
  state: AvailabilityState;
  /** Optional PTO note rendered after the label while `ausente`. */
  note?: string | null;
  className?: string;
}

/**
 * Availability badge (BR-082). State is icon + label + colour zone — never
 * colour alone (WCAG AA). The label text is the primary cue; the colour and
 * icon reinforce it.
 */
export function AvailabilityBadge({ state, note, className }: AvailabilityBadgeProps) {
  const t = useTranslations("team.availability");
  const Icon = ICONS[state];
  return (
    <Badge variant={availabilityBadgeVariant(state)} className={className}>
      <Icon aria-hidden strokeWidth={1.8} />
      {t(state)}
      {state === "ausente" && note ? (
        <span className="font-normal opacity-80">· {note}</span>
      ) : null}
    </Badge>
  );
}
