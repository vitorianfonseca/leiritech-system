"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Save, FileStack } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableCombobox, SkeletonCard, toast, type ComboboxItem } from "@/components/shared";
import { formatEUR } from "@/components/finance/finance-format";
import { proposalsApi } from "@/lib/api/proposals";
import { proposalTemplatesApi } from "@/lib/api/proposal-templates";
import {
  computeTotals,
  contentItemsToLines,
  type LineItem,
  type ProposalContent,
  type SectionData,
} from "@/lib/api/proposal-content-types";
import { LineItemsTable } from "./line-items-table";
import { SectionEditor } from "../proposal-templates/section-editor";
import { TotalsPanel } from "./totals-panel";

const TEXTAREA_CLASS =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

interface Props {
  proposalId: string;
  isDraft: boolean;
  canManage: boolean;
}

/** Loader: fetches content, then renders the editor (draft) or a read-only
 * summary. Remounts the inner editor via `key` whenever the content changes so
 * initial state stays in sync without a setState-in-effect. */
export function ProposalContentEditor({ proposalId, isDraft, canManage }: Props) {
  const t = useTranslations("proposals.content");
  const { data, isLoading } = useQuery({
    queryKey: ["proposal-content", proposalId],
    queryFn: () => proposalsApi.getContent(proposalId),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <Link
          href={`/crm/proposals/${proposalId}/preview`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Eye aria-hidden />
          {t("preview")}
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <SkeletonCard />
        ) : isDraft && canManage ? (
          <ContentEditorInner
            key={JSON.stringify(data).length + ":" + data.items.length + ":" + data.sections.length}
            proposalId={proposalId}
            content={data}
          />
        ) : (
          <ContentReadOnly content={data} />
        )}
      </CardContent>
    </Card>
  );
}

function ContentEditorInner({
  proposalId,
  content,
}: {
  proposalId: string;
  content: ProposalContent;
}) {
  const t = useTranslations("proposals.content");
  const qc = useQueryClient();

  const [sections, setSections] = React.useState<SectionData[]>(
    content.sections.map((s) => ({ heading: s.heading, body: s.body }))
  );
  const [items, setItems] = React.useState<LineItem[]>(contentItemsToLines(content.items));
  const [terms, setTerms] = React.useState(content.terms ?? "");
  const [discountPct, setDiscountPct] = React.useState(String(content.discountBps / 100));

  const discountBps = Math.round((Number(discountPct.replace(",", ".")) || 0) * 100);
  const totals = computeTotals(items, discountBps);

  const templatesQuery = useQuery({
    queryKey: ["proposal-templates", "options"],
    queryFn: () => proposalTemplatesApi.list(),
  });
  const templateOptions: ComboboxItem[] = (templatesQuery.data?.items ?? []).map((tpl) => ({
    value: tpl.id,
    label: tpl.name,
  }));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["proposal-content", proposalId] });
    qc.invalidateQueries({ queryKey: ["proposals"] });
  };

  const save = useMutation({
    mutationFn: () =>
      proposalsApi.setContent(proposalId, { discountBps, terms: terms.trim() || null, sections, items }),
    onSuccess: () => {
      invalidate();
      toast({ tone: "success", title: t("savedToast") });
    },
    onError: () => toast({ tone: "destructive", title: t("errorToast") }),
  });

  const applyTemplate = useMutation({
    mutationFn: (templateId: string) => proposalsApi.applyTemplate(proposalId, templateId),
    onSuccess: () => {
      invalidate();
      toast({ tone: "success", title: t("appliedToast") });
    },
    onError: () => toast({ tone: "destructive", title: t("errorToast") }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-3">
        <FileStack className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">{t("applyTemplateLabel")}</span>
        <div className="w-64 max-w-full">
          <SearchableCombobox
            items={templateOptions}
            value={null}
            loading={templatesQuery.isPending}
            placeholder={t("applyTemplatePlaceholder")}
            emptyMessage={t("noTemplates")}
            onValueChange={(v) => v && applyTemplate.mutate(v)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t("sectionsTitle")}</h3>
            <SectionEditor value={sections} onChange={setSections} />
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t("itemsTitle")}</h3>
            <LineItemsTable value={items} onChange={setItems} />
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t("termsTitle")}</h3>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={4}
              className={TEXTAREA_CLASS}
              placeholder={t("termsPlaceholder")}
              aria-label={t("termsTitle")}
            />
          </section>
        </div>
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-foreground">{t("discount")}</span>
            <input
              inputMode="decimal"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <TotalsPanel totals={totals} />
          <Button className="w-full" size="lg" disabled={save.isPending} onClick={() => save.mutate()}>
            <Save aria-hidden />
            {save.isPending ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ContentReadOnly({ content }: { content: ProposalContent }) {
  const t = useTranslations("proposals.content");
  const locale = useLocale();

  if (content.items.length === 0 && content.sections.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("emptyReadOnly")}</p>;
  }

  return (
    <div className="space-y-6">
      {content.sections.map((s) => (
        <div key={s.id} className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{s.heading}</h3>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{s.body}</p>
        </div>
      ))}
      {content.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <tbody>
              {content.items.map((it) => (
                <tr key={it.id} className="border-b border-border/60">
                  <td className="py-2 pr-4 text-foreground">{it.name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                    {String(it.quantity).replace(".", ",")} ×
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatEUR(it.unitPrice, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <TotalsPanel totals={content.totals} />
    </div>
  );
}
