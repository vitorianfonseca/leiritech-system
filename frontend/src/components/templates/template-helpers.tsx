"use client";

import { useTranslations } from "next-intl";
import { Globe, Smartphone, Lightbulb, LifeBuoy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TemplateType, TemplateTaskRole } from "@/lib/api/template-types";

const TYPE_ICON: Record<TemplateType, LucideIcon> = {
  website: Globe,
  app: Smartphone,
  consulting: Lightbulb,
  maintenance: LifeBuoy,
};

/** Type pill — icon + localized label. Uses stone/gold chrome, never a new hue. */
export function TemplateTypeBadge({ type }: { type: TemplateType }) {
  const t = useTranslations("templates.types");
  const Icon = TYPE_ICON[type];
  return (
    <Badge variant="outline" className="gap-1.5">
      <Icon className="size-3.5 text-gold" strokeWidth={1.8} aria-hidden />
      {t(type)}
    </Badge>
  );
}

/** Localized delivery-role label for a template task. */
export function useRoleLabel() {
  const t = useTranslations("templates.roles");
  return (role: TemplateTaskRole) => t(role);
}

/** Localized "N dias" duration. */
export function useDurationLabel() {
  const t = useTranslations("templates");
  return (days: number) => t("durationDays", { count: days });
}
