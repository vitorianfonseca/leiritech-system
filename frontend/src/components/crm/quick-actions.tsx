"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Mail, Phone, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface QuickActionsProps {
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  size?: "sm" | "icon-sm" | "icon";
}

/**
 * Email / phone / website quick actions. Rendered as real anchors (mailto:,
 * tel:, external https) so they work with keyboard + assistive tech and never
 * dead-end. Each affordance is omitted when its value is absent.
 */
export function QuickActions({ email, phone, website, size = "icon-sm" }: QuickActionsProps) {
  const t = useTranslations("crm.quickActions");

  const actions: Array<{
    key: string;
    href: string;
    label: string;
    icon: typeof Mail;
    external?: boolean;
  }> = [];
  if (email) actions.push({ key: "email", href: `mailto:${email}`, label: t("email"), icon: Mail });
  if (phone)
    actions.push({
      key: "phone",
      href: `tel:${phone.replace(/\s+/g, "")}`,
      label: t("phone"),
      icon: Phone,
    });
  if (website)
    actions.push({
      key: "website",
      href: website,
      label: t("website"),
      icon: Globe,
      external: true,
    });

  if (actions.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Button
            key={a.key}
            variant="outline"
            size={size}
            nativeButton={false}
            aria-label={a.label}
            title={a.label}
            render={
              <a
                href={a.href}
                {...(a.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                onClick={(e) => e.stopPropagation()}
              />
            }
          >
            <Icon aria-hidden />
          </Button>
        );
      })}
    </div>
  );
}
