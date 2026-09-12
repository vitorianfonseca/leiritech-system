"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, GitBranch, FolderKanban, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CompanyDetail } from "@/lib/api/crm-types";
import { formatDate, formatEUR } from "./crm-format";

export function InformationTab({ company }: { company: CompanyDetail }) {
  const t = useTranslations("crm.detail.info");
  const tSource = useTranslations("crm.source");
  const locale = useLocale();

  const rows: Array<[string, React.ReactNode]> = [
    [t("sector"), company.sector],
    [
      t("website"),
      company.website ? (
        <a
          href={company.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-signal hover:underline"
        >
          {company.website}
        </a>
      ) : (
        "—"
      ),
    ],
    [
      t("email"),
      company.email ? (
        <a href={`mailto:${company.email}`} className="text-signal hover:underline">
          {company.email}
        </a>
      ) : (
        "—"
      ),
    ],
    [t("phone"), company.phone ?? "—"],
    [t("address"), company.address ?? "—"],
    [t("owner"), company.ownerName],
    [t("source"), tSource(company.source)],
    [t("lastInteraction"), company.lastInteractionAt ? formatDate(company.lastInteractionAt) : "—"],
  ];

  const metrics: Array<{ label: string; value: string; icon: typeof GitBranch }> = [
    {
      label: t("openOpportunities"),
      value: String(company.openOpportunities),
      icon: GitBranch,
    },
    { label: t("activeProjects"), value: String(company.activeProjects), icon: FolderKanban },
  ];
  if (company.canSeeFinancials) {
    metrics.push({
      label: t("totalContracted"),
      value:
        company.totalContractedCents != null ? formatEUR(company.totalContractedCents, locale) : "—",
      icon: Wallet,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {company.description ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm leading-relaxed text-foreground">{company.description}</p>
            </CardContent>
          </Card>
        ) : null}

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
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-1.5 pt-6">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="size-3.5" strokeWidth={1.8} aria-hidden />
              {t("nextAction")}
            </p>
            {company.nextAction ? (
              <>
                <p className="text-sm font-medium text-foreground">{company.nextAction}</p>
                {company.nextActionAt ? (
                  <p className="text-xs text-muted-foreground">{formatDate(company.nextActionAt)}</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noNextAction")}</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <Card key={m.label}>
                <CardContent className="space-y-1 pt-6">
                  <Icon className="size-4 text-signal" strokeWidth={1.8} aria-hidden />
                  <p className="font-heading text-xl font-semibold tabular-nums text-foreground">
                    {m.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
