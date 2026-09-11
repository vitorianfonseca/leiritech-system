"use client";

import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SkeletonCard, EmptyState } from "@/components/shared";
import { formatEUR, formatDate } from "@/components/finance/finance-format";
import { proposalsApi } from "@/lib/api/proposals";
import { crmApi } from "@/lib/api/crm";
import type { BillingType } from "@/lib/api/catalog-types";
import type { ContentItem } from "@/lib/api/proposal-content-types";
import type { Role } from "@/lib/session";

// Print: hide the app chrome and let only the document paint. The sheet drops
// its screen shadow/border and expands to the page margins.
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #proposal-print, #proposal-print * { visibility: visible !important; }
  #proposal-print {
    position: absolute; inset: 0; margin: 0; width: 100%;
    box-shadow: none !important; border: 0 !important; border-radius: 0 !important;
  }
  .no-print { display: none !important; }
}
`;

export interface ProposalPreviewProps {
  proposalId: string;
  user: { role: Role; userId: string; paymentsGrant: boolean };
  brandName: string;
}

const UNIT_KEYS: Record<string, string> = {
  unit: "unit",
  hour: "hour",
  day: "day",
  month: "month",
  m2: "m2",
  license: "license",
  fixed: "fixed",
};

/**
 * The branded LeiriTech proposal document. Editorial layout on cool paper: a
 * masthead with the wordmark, a "prepared for" block, numbered content
 * sections, an investment table grouped by billing cadence, and the upfront
 * total set as the one editorial figure with a cobalt underline. Print-optimised
 * so "Imprimir" produces a clean PDF.
 */
export function ProposalPreview({ proposalId, user, brandName }: ProposalPreviewProps) {
  const t = useTranslations("proposals.preview");
  const tBilling = useTranslations("catalog.billing");
  const tUnits = useTranslations("catalog.units");
  const locale = useLocale();

  const proposalQuery = useQuery({
    queryKey: ["proposals", "detail", proposalId, user.role, user.userId, user.paymentsGrant],
    queryFn: () => proposalsApi.getProposal(proposalId, user.role, user.userId, user.paymentsGrant),
  });
  const contentQuery = useQuery({
    queryKey: ["proposal-content", proposalId],
    queryFn: () => proposalsApi.getContent(proposalId),
  });
  const companyId = proposalQuery.data?.companyId || null;
  const companyQuery = useQuery({
    queryKey: ["crm", "company", companyId],
    queryFn: () => crmApi.getCompany(companyId as string, user.role, user.userId, user.paymentsGrant),
    enabled: Boolean(companyId),
  });

  if (proposalQuery.isLoading || contentQuery.isLoading) return <SkeletonCard />;
  if (proposalQuery.isError || !proposalQuery.data || !contentQuery.data) {
    return <EmptyState title={t("notFoundTitle")} description={t("notFoundDescription")} />;
  }

  const p = proposalQuery.data;
  const content = contentQuery.data;
  const clientName = companyQuery.data?.name || p.companyName;
  const f = (cents: number) => formatEUR(cents, locale);
  const qtyLabel = (q: string) => String(q).replace(".", ",").replace(/,00$/, "");

  const groups: { key: BillingType; items: ContentItem[] }[] = (
    ["one_time", "monthly", "annual"] as BillingType[]
  )
    .map((key) => ({ key, items: content.items.filter((it) => it.billingType === key) }))
    .filter((g) => g.items.length > 0);

  const hasRecurring = content.totals.monthly.gross > 0 || content.totals.annual.gross > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <style>{PRINT_CSS}</style>

      <div className="no-print flex items-center justify-between gap-4">
        <Link
          href={`/crm/proposals/${proposalId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      >
        {/* Masthead */}
        <header className="px-10 pt-10 sm:px-14 sm:pt-14">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-9 place-items-center rounded-full bg-gold/15 ring-1 ring-gold/40"
              >
                <span className="size-3 rounded-full bg-gold" />
              </span>
              <div className="leading-tight">
                <p className="font-heading text-xl font-semibold tracking-tight text-foreground">
                  {brandName}
                </p>
                <p className="text-xs text-muted-foreground">{t("tagline")}</p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">
                {t("documentLabel")}
              </p>
              <p className="mt-1 font-mono text-sm font-medium text-foreground">{p.reference}</p>
              <dl className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                <div className="flex justify-end gap-2">
                  <dt>{t("dateLabel")}</dt>
                  <dd className="text-foreground">{formatDate(p.createdAt.slice(0, 10))}</dd>
                </div>
                {p.validUntil ? (
                  <div className="flex justify-end gap-2">
                    <dt>{t("validUntilLabel")}</dt>
                    <dd className="text-foreground">{formatDate(p.validUntil)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>

          <div className="mt-8 h-px w-full bg-gradient-to-r from-gold/70 via-border to-transparent" />
        </header>

        {/* Title + prepared for */}
        <section className="px-10 pt-10 sm:px-14">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("preparedFor")}
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {clientName}
          </h1>
          {p.contactName ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("attn")} {p.contactName}
            </p>
          ) : null}
        </section>

        {/* Sections */}
        <div className="space-y-10 px-10 py-12 sm:px-14">
          {content.sections.map((s, i) => (
            <section key={s.id} className="grid grid-cols-[2.5rem_1fr] gap-x-4 sm:grid-cols-[3.5rem_1fr]">
              <div aria-hidden className="pt-1">
                <span className="font-mono text-sm text-gold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="mt-2 block h-8 w-px bg-border" />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                  {s.heading}
                </h2>
                <p className="mt-2 whitespace-pre-line text-[0.95rem] leading-relaxed text-foreground/85">
                  {s.body}
                </p>
              </div>
            </section>
          ))}

          {/* Investment */}
          {groups.length > 0 ? (
            <section className="grid grid-cols-[2.5rem_1fr] gap-x-4 sm:grid-cols-[3.5rem_1fr]">
              <div aria-hidden className="pt-1">
                <span className="font-mono text-sm text-gold">
                  {String(content.sections.length + 1).padStart(2, "0")}
                </span>
                <span className="mt-2 block h-8 w-px bg-border" />
              </div>
              <div className="min-w-0 space-y-6">
                <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                  {t("investment")}
                </h2>

                {groups.map((group) => (
                  <div key={group.key} className="space-y-1">
                    {groups.length > 1 ? (
                      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {tBilling(group.key)}
                      </p>
                    ) : null}
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 font-medium">{t("description")}</th>
                          <th className="py-2 text-right font-medium">{t("quantity")}</th>
                          <th className="py-2 text-right font-medium">{t("unitPrice")}</th>
                          <th className="py-2 text-right font-medium">{t("lineTotal")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((it) => {
                          const qty = Number(String(it.quantity).replace(",", ".")) || 0;
                          return (
                            <tr key={it.id} className="border-b border-border/50 align-top">
                              <td className="py-2.5 pr-3 text-foreground">{it.name}</td>
                              <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                                {qtyLabel(it.quantity)} {tUnits(UNIT_KEYS[it.unit] ?? "unit")}
                              </td>
                              <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                                {f(it.unitPrice)}
                              </td>
                              <td className="py-2.5 text-right tabular-nums text-foreground">
                                {f(Math.round(qty * it.unitPrice))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}

                {/* Totals */}
                <div className="grid gap-6 pt-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-muted/60 p-5">
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t("oneTimeNet")}</span>
                        <span className="tabular-nums">{f(content.totals.oneTime.net)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t("oneTimeVat")}</span>
                        <span className="tabular-nums">{f(content.totals.oneTime.tax)}</span>
                      </div>
                    </div>
                    {hasRecurring ? (
                      <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                        {content.totals.monthly.gross > 0 ? (
                          <div className="flex justify-between text-muted-foreground">
                            <span>{t("monthlyTotal")}</span>
                            <span className="tabular-nums text-foreground">
                              {f(content.totals.monthly.gross)}
                            </span>
                          </div>
                        ) : null}
                        {content.totals.annual.gross > 0 ? (
                          <div className="flex justify-between text-muted-foreground">
                            <span>{t("annualTotal")}</span>
                            <span className="tabular-nums text-foreground">
                              {f(content.totals.annual.gross)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col justify-end">
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("oneTimeTotal")}
                    </p>
                    <p className="mt-1 font-heading text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                      {f(content.totals.oneTime.gross)}
                    </p>
                    <span aria-hidden className="mt-2 h-0.5 w-24 rounded-full bg-gold" />
                    <p className="mt-2 text-xs text-muted-foreground">{t("vatIncluded")}</p>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* Terms */}
          {content.terms ? (
            <section className="rounded-xl border border-border bg-muted/40 p-6">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
                {t("terms")}
              </h2>
              <p className="mt-3 whitespace-pre-line text-[0.85rem] leading-relaxed text-muted-foreground">
                {content.terms}
              </p>
            </section>
          ) : null}
        </div>

        {/* Footer */}
        <footer className="border-t border-border bg-muted/30 px-10 py-6 sm:px-14">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-heading font-medium text-foreground">{brandName}</span>
            <span>{t("footer", { reference: p.reference })}</span>
          </div>
        </footer>
      </article>
    </div>
  );
}
