"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { UserRound, SlidersHorizontal, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { PageHeader } from "@/components/shell/page-header";
import { PersonalInfoForm } from "./personal-info-form";
import { PreferencesSection } from "./preferences-section";
import { SecuritySection } from "./security-section";

export function ProfileView({ user }: { user: SessionUser }) {
  const t = useTranslations("profile");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Section icon={UserRound} title={t("personal.title")} description={t("personal.subtitle")}>
        <PersonalInfoForm user={user} />
      </Section>

      <Section
        icon={SlidersHorizontal}
        title={t("preferences.title")}
        description={t("preferences.subtitle")}
      >
        <PreferencesSection user={user} />
      </Section>

      <Section
        icon={ShieldCheck}
        title={t("security.title")}
        description={t("security.subtitle")}
      >
        <SecuritySection user={user} />
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3 border-b border-border pb-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold-muted/50 text-gold">
          <Icon className="size-5" strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="pt-6">{children}</div>
    </section>
  );
}
