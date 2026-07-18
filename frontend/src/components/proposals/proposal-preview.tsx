"use client";

import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SkeletonCard, EmptyState } from "@/components/shared";
import { formatEUR, formatDate } from "@/components/finance/finance-format";
import { proposalsApi } from "@/lib/api/proposals";
import type { BillingType } from "@/lib/api/catalog-types";
import type { ContentItem } from "@/lib/api/proposal-content-types";
import type { Role } from "@/lib/session";

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #proposal-print, #proposal-print * { visibility: visible !important; }
  #proposal-print { position: absolute; inset: 0; margin: 0; padding: 0 24px; }
  .no-print { display: none !important; }
}
`;

export interface ProposalPreviewProps {
  proposalId: string;
  user: { role: Role; userId: string; paymentsGrant: boolean };
  brandName: string;
}

/**
 * Branded, print-optimised proposal view. Groups line items by billing cadence
 * with per-group subtotals and shows one-time / recurring totals separately.
 * "Imprimir" triggers the browser print dialog; a print stylesheet hides the
 * app chrome so only this document prints (or saves to PDF).
 */
export function ProposalPreview({ proposalId, user, brandName }: ProposalPreviewProps) {
  const t = useTranslations("proposals.preview");
  const tBilling = useTranslations("catalog.billing");
  const locale = useLocale();

  const proposalQuery = useQuery({
    queryKey: ["proposals", "detail", proposalId, user.role, user.userId, user.paymentsGrant],
    queryFn: () => proposalsApi.getProposal(proposalId, user.role, user.userId, user.paymentsGrant),
  });
  const contentQuery = useQuery({
    queryKey: ["proposal-content", proposalId],
    queryFn: () => proposalsApi.getContent(proposalId),
  });

  if (proposalQuery.isLoading || contentQuery.isLoading) return <SkeletonCard />;
  if (proposalQuery.isError || !proposalQuery.data || !contentQuery.data) {
    return <EmptyState title={t("notFoundTitle")} description={t("notFoundDescription")} />;
  }

  const p = proposalQuery.data;
  const content = contentQuery.data;
  const f = (cents: number) => formatEUR(cents, locale);

  const groups: { key: BillingType; items: ContentItem[] }[] = (
    ["one_time", "monthly", "annual"] as BillingType[]
  )
    .map((key) => ({ key, items: content.items.filter((it) => it.billingType === key) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <style>{PRINT_CSS}</style>

      <div className="no-print flex items-center justify-between gap-4">
        <Link
          href={`/crm/proposals/${proposalId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("back")}
        </Link>
        <Button size="lg" onClick={() => window.print()}>
          <Printer aria-hidden />
          {t("print")}
        </Button>
      </div>

      <article
        id="proposal-print"
        className="mx-auto max-w-3xl space-y-10 rounded-xl border border-border bg-card p-10 text-foreground shadow-sm"
      >
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="font-heading text-2xl font-semibold">{brandName}</p>
            <p className="text-sm text-muted-foreground">{t("documentLabel")}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono font-medium">{p.reference}</p>
            <p className="text-muted-foreground">
              {t("dateLabel")}: {formatDate(p.createdAt.slice(0, 10))}
            </p>
            {p.validUntil ? (
              <p className="text-muted-foreground">
                {t("validUntilLabel")}: {formatDate(p.validUntil)}
              </p>
            ) : null}
          </div>
        </header>

        {/* Client */}
        <section className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("preparedFor")}
          </p>
          <p className="text-lg font-medium">{p.companyName}</p>
          {p.contactName ? <p className="text-sm text-muted-foreground">{p.contactName}</p> : null}
        </section>

        {/* Sections */}
        {content.sections.map((s) => (
          <section key={s.id} className="space-y-2">
            <h2 className="font-heading text-lg font-semibold">{s.heading}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{s.body}</p>
          </section>
        ))}

        {/* Line items grouped by billing */}
        {groups.length > 0 ? (
          <section className="space-y-6">
            <h2 className="font-heading text-lg font-semibold">{t("investment")}</h2>
            {groups.map((group) => (
              <div key={group.key} className="space-y-2">
                {groups.length > 1 ? (
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {tBilling(group.key)}
                  </p>
                ) : null}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2">{t("description")}</th>
                      <th className="py-2 text-right">{t("quantity")}</th>
                      <th className="py-2 text-right">{t("unitPrice")}</th>
                      <th className="py-2 text-right">{t("lineTotal")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((it) => {
                      const qty = Number(String(it.quantity).replace(",", ".")) || 0;
                      return (
                        <tr key={it.id} className="border-b border-border/50">
                          <td className="py-2 pr-3">{it.name}</td>
                          <td className="py-2 text-right tabular-nums">{String(it.quantity).replace(".", ",")}</td>
                          <td className="py-2 text-right tabular-nums">{f(it.unitPrice)}</td>
                          <td className="py-2 text-right tabular-nums">{f(Math.round(qty * it.unitPrice))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}

            {/* Totals */}
            <div className="ml-auto w-full max-w-xs space-y-1.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("oneTimeNet")}</span>
                <span className="tabular-nums">{f(content.totals.oneTime.net)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("oneTimeVat")}</span>
                <span className="tabular-nums">{f(content.totals.oneTime.tax)}</span>
              </div>
              <div className="flex justify-between font-heading text-base font-semibold">
                <span>{t("oneTimeTotal")}</span>
                <span className="tabular-nums">{f(content.totals.oneTime.gross)}</span>
              </div>
              {content.totals.monthly.gross > 0 ? (
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="text-muted-foreground">{t("monthlyTotal")}</span>
                  <span className="tabular-nums">{f(content.totals.monthly.gross)}</span>
                </div>
              ) : null}
              {content.totals.annual.gross > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("annualTotal")}</span>
                  <span className="tabular-nums">{f(content.totals.annual.gross)}</span>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Terms */}
        {content.terms ? (
          <section className="space-y-2 border-t border-border pt-6">
            <h2 className="font-heading text-lg font-semibold">{t("terms")}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{content.terms}</p>
          </section>
        ) : null}
      </article>
    </div>
  );
}
