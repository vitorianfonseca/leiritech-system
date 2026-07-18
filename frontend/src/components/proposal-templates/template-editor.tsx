"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmField } from "@/components/crm/crm-field";
import { toast } from "@/components/shared";
import { LineItemsTable } from "@/components/proposals/line-items-table";
import { TotalsPanel } from "@/components/proposals/totals-panel";
import { computeTotals, type LineItem, type SectionData } from "@/lib/api/proposal-content-types";
import { proposalTemplatesApi } from "@/lib/api/proposal-templates";
import type { ProposalTemplate } from "@/lib/api/proposal-templates-types";
import { SectionEditor } from "./section-editor";

const TEXTAREA_CLASS =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

function toLineItems(template: ProposalTemplate | null): LineItem[] {
  if (!template) return [];
  return template.items.map((it) => ({
    catalogItemId: it.catalogItemId,
    name: it.name,
    unit: it.unit,
    unitPrice: it.unitPrice,
    taxRate: it.taxRate,
    billingType: it.billingType,
    quantity: Number(String(it.quantity).replace(",", ".")) || 0,
  }));
}

export interface TemplateEditorProps {
  /** Existing template to edit, or null to create a new one. */
  template?: ProposalTemplate | null;
}

/**
 * Full-page proposal-template editor used by both /new and /[id]. Left column:
 * metadata + text sections + priced line items + terms. Right column: sticky
 * live totals + defaults (validity, discount). Save persists via create/update
 * (sections/items are replaced) and redirects to the template's page.
 */
export function TemplateEditor({ template = null }: TemplateEditorProps) {
  const t = useTranslations("proposalTemplates.editor");
  const router = useRouter();
  const qc = useQueryClient();

  const [name, setName] = React.useState(template?.name ?? "");
  const [description, setDescription] = React.useState(template?.description ?? "");
  const [validityDays, setValidityDays] = React.useState(
    template?.defaultValidityDays != null ? String(template.defaultValidityDays) : "30"
  );
  const [discountPct, setDiscountPct] = React.useState(
    template ? String(template.defaultDiscountBps / 100) : "0"
  );
  const [terms, setTerms] = React.useState(template?.terms ?? "");
  const [sections, setSections] = React.useState<SectionData[]>(
    template?.sections.map((s) => ({ heading: s.heading, body: s.body })) ?? []
  );
  const [items, setItems] = React.useState<LineItem[]>(toLineItems(template));

  const discountBps = Math.round((Number(discountPct.replace(",", ".")) || 0) * 100);
  const totals = computeTotals(items, discountBps);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        defaultValidityDays: validityDays ? Number(validityDays) : null,
        defaultDiscountBps: discountBps,
        terms: terms.trim() || null,
        sections: sections.map((s) => ({ heading: s.heading.trim(), body: s.body })),
        items: items.map((it) => ({
          catalogItemId: it.catalogItemId,
          name: it.name.trim(),
          unit: it.unit,
          unitPrice: it.unitPrice,
          taxRate: it.taxRate,
          billingType: it.billingType,
          quantity: it.quantity,
        })),
      };
      return template
        ? proposalTemplatesApi.update(template.id, payload)
        : proposalTemplatesApi.create(payload);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["proposal-templates"] });
      toast({ tone: "success", title: t("savedToast") });
      router.push(`/crm/proposal-templates/${saved.id}`);
    },
    onError: () => toast({ tone: "destructive", title: t("errorToast") }),
  });

  const canSave = name.trim().length > 0 && !save.isPending;

  return (
    <div className="space-y-6">
      <Link
        href="/crm/proposal-templates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {template ? t("editTitle") : t("createTitle")}
        </h1>
        <Button size="lg" disabled={!canSave} onClick={() => save.mutate()}>
          <Save aria-hidden />
          {save.isPending ? t("saving") : t("save")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <CrmField label={t("name")} required>
              {({ controlProps }) => (
                <Input {...controlProps} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
              )}
            </CrmField>
            <CrmField label={t("description")}>
              {({ controlProps }) => (
                <textarea {...controlProps} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={TEXTAREA_CLASS} placeholder={t("descriptionPlaceholder")} />
              )}
            </CrmField>
          </div>

          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold text-foreground">{t("sectionsTitle")}</h2>
            <SectionEditor value={sections} onChange={setSections} />
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold text-foreground">{t("itemsTitle")}</h2>
            <LineItemsTable value={items} onChange={setItems} />
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold text-foreground">{t("termsTitle")}</h2>
            <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={5} className={TEXTAREA_CLASS} placeholder={t("termsPlaceholder")} aria-label={t("termsTitle")} />
          </section>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <CrmField label={t("validityDays")} hint={t("validityHint")}>
              {({ controlProps }) => (
                <Input {...controlProps} inputMode="numeric" value={validityDays} onChange={(e) => setValidityDays(e.target.value.replace(/\D/g, ""))} />
              )}
            </CrmField>
            <CrmField label={t("discount")} hint={t("discountHint")}>
              {({ controlProps }) => (
                <Input {...controlProps} inputMode="decimal" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
              )}
            </CrmField>
          </div>
          <TotalsPanel totals={totals} />
        </div>
      </div>
    </div>
  );
}
