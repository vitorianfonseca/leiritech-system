"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableCombobox, type ComboboxItem } from "@/components/shared";
import { CrmField } from "@/components/crm/crm-field";
import { zodResolver } from "@/lib/form/zod-resolver";
import {
  createProposalSchema,
  type CreateProposalFormValues,
} from "@/lib/validation/proposal-schemas";
import { crmApi } from "@/lib/api/crm";
import { opportunitiesApi } from "@/lib/api/opportunities";
import { proposalTemplatesApi } from "@/lib/api/proposal-templates";
import type { CreateProposalInput } from "@/lib/api/proposals-types";
import type { Role } from "@/lib/session";
import { parseEuroToCents } from "./proposal-format";

export interface CreateProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { role: Role; userId: string; paymentsGrant: boolean };
  canFinance: boolean;
  onConfirm: (input: CreateProposalInput, templateId: string | null) => Promise<void>;
}

const DEFAULTS: CreateProposalFormValues = {
  opportunityId: "",
  contactId: "",
  value: "",
  validUntil: "",
  notes: "",
};

/**
 * Quick-create a proposal (F6). The proposal is created in `draft`; the PDF is
 * attached afterwards on the detail page. Only the linked opportunity is
 * required up front — value + validity may be filled now or before sending
 * (BR-025 is enforced at send time). Contacts are scoped to the chosen
 * opportunity's company.
 */
export function CreateProposalDialog({
  open,
  onOpenChange,
  user,
  canFinance,
  onConfirm,
}: CreateProposalDialogProps) {
  const t = useTranslations("proposals.create");
  const tv = useTranslations("proposals.validation");

  const opportunitiesQuery = useQuery({
    queryKey: ["pipeline", "opportunities", "options", user.role, user.userId, user.paymentsGrant],
    queryFn: () =>
      opportunitiesApi.listOpportunities(user.role, user.userId, user.paymentsGrant),
    enabled: open,
  });
  const contactsQuery = useQuery({
    queryKey: ["crm", "contacts", "options", user.role, user.userId],
    queryFn: () =>
      crmApi.listContacts({
        role: user.role,
        userId: user.userId,
        paymentsGrant: user.paymentsGrant,
      }),
    enabled: open,
  });
  const templatesQuery = useQuery({
    queryKey: ["proposal-templates", "options"],
    queryFn: () => proposalTemplatesApi.list(),
    enabled: open,
  });
  const [templateId, setTemplateId] = React.useState<string | null>(null);

  const {
    control,
    setValue,
    handleSubmit,
    register,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProposalFormValues>({
    resolver: zodResolver(createProposalSchema((k) => tv(k))),
    defaultValues: DEFAULTS,
  });

  React.useEffect(() => {
    register("opportunityId");
    register("contactId");
  }, [register]);

  React.useEffect(() => {
    if (open) reset(DEFAULTS);
  }, [open, reset]);

  const templateOptions: ComboboxItem[] = (templatesQuery.data?.items ?? []).map((tpl) => ({
    value: tpl.id,
    label: tpl.name,
  }));

  const opportunityId = useWatch({ control, name: "opportunityId" });
  const contactId = useWatch({ control, name: "contactId" });

  const openOpportunities = (opportunitiesQuery.data ?? []).filter(
    (o) => o.outcome === null
  );
  const opportunityOptions: ComboboxItem[] = openOpportunities.map((o) => ({
    value: o.id,
    label: `${o.title} · ${o.companyName}`,
  }));

  const selectedCompanyId = openOpportunities.find((o) => o.id === opportunityId)?.companyId;
  const contactOptions: ComboboxItem[] = (contactsQuery.data ?? [])
    .filter((c) => !selectedCompanyId || c.companyId === selectedCompanyId)
    .map((c) => ({ value: c.id, label: c.name }));

  async function submit(values: CreateProposalFormValues) {
    await onConfirm(
      {
        opportunityId: values.opportunityId,
        contactId: values.contactId ? values.contactId : null,
        valueCents: values.value ? parseEuroToCents(values.value) : null,
        validUntil: values.validUntil ? values.validUntil : null,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      },
      templateId
    );
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting) return;
        if (!next) setTemplateId(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-6">
        <div className="space-y-1.5">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </div>

        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <CrmField label={t("fields.template")} hint={t("fields.templateHint")}>
            {({ controlProps }) => (
              <SearchableCombobox
                id={controlProps.id}
                aria-label={t("fields.template")}
                items={templateOptions}
                loading={templatesQuery.isPending}
                value={templateId}
                clearable
                placeholder={t("fields.templatePlaceholder")}
                emptyMessage={t("fields.noTemplates")}
                onValueChange={(v) => setTemplateId(v)}
              />
            )}
          </CrmField>

          <CrmField label={t("fields.opportunity")} required error={errors.opportunityId?.message}>
            {({ controlProps }) => (
              <SearchableCombobox
                id={controlProps.id}
                aria-label={t("fields.opportunity")}
                items={opportunityOptions}
                loading={opportunitiesQuery.isPending}
                value={opportunityId || null}
                placeholder={t("fields.opportunityPlaceholder")}
                emptyMessage={t("fields.noOpportunities")}
                onValueChange={(v) => {
                  setValue("opportunityId", v ?? "", { shouldValidate: true });
                  setValue("contactId", "");
                }}
              />
            )}
          </CrmField>

          <CrmField label={t("fields.contact")} error={errors.contactId?.message}>
            {({ controlProps }) => (
              <SearchableCombobox
                id={controlProps.id}
                aria-label={t("fields.contact")}
                items={contactOptions}
                loading={contactsQuery.isPending}
                value={contactId || null}
                placeholder={t("fields.contactPlaceholder")}
                emptyMessage={t("fields.noContacts")}
                onValueChange={(v) => setValue("contactId", v ?? "")}
              />
            )}
          </CrmField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {canFinance ? (
              <CrmField label={t("fields.value")} error={errors.value?.message} hint={t("fields.valueHint")}>
                {({ controlProps }) => (
                  <Input
                    {...controlProps}
                    {...register("value")}
                    inputMode="decimal"
                    placeholder={t("fields.valuePlaceholder")}
                  />
                )}
              </CrmField>
            ) : null}
            <CrmField label={t("fields.validUntil")} error={errors.validUntil?.message} hint={t("fields.validUntilHint")}>
              {({ controlProps }) => (
                <Input {...controlProps} {...register("validUntil")} type="date" />
              )}
            </CrmField>
          </div>

          <CrmField label={t("fields.notes")} error={errors.notes?.message}>
            {({ controlProps }) => (
              <textarea
                {...controlProps}
                {...register("notes")}
                rows={3}
                placeholder={t("fields.notesPlaceholder")}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
              />
            )}
          </CrmField>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : t("confirm")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
