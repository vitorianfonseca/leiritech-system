"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableCombobox, type ComboboxItem } from "@/components/shared";
import { zodResolver } from "@/lib/form/zod-resolver";
import { interactionSchema, type InteractionFormValues } from "@/lib/validation/crm-schemas";
import { INTERACTION_TYPES, type InteractionInput } from "@/lib/api/crm-types";
import { CrmField } from "./crm-field";

const TEXTAREA_CLASS =
  "flex w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export interface InteractionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  authorId: string;
  contacts: ComboboxItem[];
  opportunities: ComboboxItem[];
  projects: ComboboxItem[];
  onSubmit: (input: InteractionInput) => Promise<void>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Log an interaction (chamada/reunião/email/mensagem/nota/follow-up) linked to
 * a company and optionally a contact/opportunity/project (WORKFLOW_SPEC §14). */
export function InteractionDialog({
  open,
  onOpenChange,
  companyId,
  authorId,
  contacts,
  opportunities,
  projects,
  onSubmit,
}: InteractionDialogProps) {
  const t = useTranslations("crm.interactions");
  const tType = useTranslations("crm.interactionType");
  const tv = useTranslations("crm.validation");

  const form = useForm<InteractionFormValues>({
    resolver: zodResolver(interactionSchema((k) => tv(k))),
    defaultValues: {
      type: "call",
      subject: "",
      occurredAt: todayIso(),
      contactId: "",
      opportunityId: "",
      projectId: "",
      body: "",
    },
  });
  const {
    register,
    setValue,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  React.useEffect(() => {
    register("type");
    register("contactId");
    register("opportunityId");
    register("projectId");
  }, [register]);

  React.useEffect(() => {
    if (open) reset({ type: "call", subject: "", occurredAt: todayIso(), contactId: "", opportunityId: "", projectId: "", body: "" });
  }, [open, reset]);

  const type = useWatch({ control, name: "type" });
  const contactId = useWatch({ control, name: "contactId" });
  const opportunityId = useWatch({ control, name: "opportunityId" });
  const projectId = useWatch({ control, name: "projectId" });

  const typeOptions: ComboboxItem[] = INTERACTION_TYPES.map((v) => ({ value: v, label: tType(v) }));

  async function submit(values: InteractionFormValues) {
    const input: InteractionInput = {
      companyId,
      contactId: values.contactId || null,
      opportunityId: values.opportunityId || null,
      projectId: values.projectId || null,
      type: values.type,
      subject: values.subject.trim(),
      body: values.body?.trim() ? values.body.trim() : null,
      occurredAt: new Date(`${values.occurredAt}T09:00:00`).toISOString(),
      authorId,
    };
    await onSubmit(input);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-6">
        <div className="space-y-1.5">
          <DialogTitle>{t("logTitle")}</DialogTitle>
          <DialogDescription>{t("logSubtitle")}</DialogDescription>
        </div>

        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CrmField label={t("fields.type")} error={errors.type?.message}>
              {({ controlProps }) => (
                <SearchableCombobox
                  id={controlProps.id}
                  aria-label={t("fields.type")}
                  items={typeOptions}
                  value={type || null}
                  clearable={false}
                  onValueChange={(v) => setValue("type", (v ?? "call") as InteractionFormValues["type"], { shouldValidate: true })}
                />
              )}
            </CrmField>
            <CrmField label={t("fields.date")} error={errors.occurredAt?.message}>
              {({ controlProps }) => <Input {...controlProps} {...register("occurredAt")} type="date" />}
            </CrmField>
          </div>

          <CrmField label={t("fields.subject")} required error={errors.subject?.message}>
            {({ controlProps }) => (
              <Input {...controlProps} {...register("subject")} placeholder={t("fields.subjectPlaceholder")} autoFocus />
            )}
          </CrmField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <CrmField label={t("fields.contact")} error={errors.contactId?.message}>
              {({ controlProps }) => (
                <SearchableCombobox
                  id={controlProps.id}
                  aria-label={t("fields.contact")}
                  items={contacts}
                  value={contactId || null}
                  onValueChange={(v) => setValue("contactId", v ?? "")}
                  placeholder={t("fields.optional")}
                  emptyMessage={t("fields.noContacts")}
                />
              )}
            </CrmField>
            <CrmField label={t("fields.opportunity")} error={errors.opportunityId?.message}>
              {({ controlProps }) => (
                <SearchableCombobox
                  id={controlProps.id}
                  aria-label={t("fields.opportunity")}
                  items={opportunities}
                  value={opportunityId || null}
                  onValueChange={(v) => setValue("opportunityId", v ?? "")}
                  placeholder={t("fields.optional")}
                  emptyMessage={t("fields.noOpportunities")}
                />
              )}
            </CrmField>
            <CrmField label={t("fields.project")} error={errors.projectId?.message}>
              {({ controlProps }) => (
                <SearchableCombobox
                  id={controlProps.id}
                  aria-label={t("fields.project")}
                  items={projects}
                  value={projectId || null}
                  onValueChange={(v) => setValue("projectId", v ?? "")}
                  placeholder={t("fields.optional")}
                  emptyMessage={t("fields.noProjects")}
                />
              )}
            </CrmField>
          </div>

          <CrmField label={t("fields.notes")} error={errors.body?.message}>
            {({ controlProps }) => (
              <textarea
                {...controlProps}
                {...register("body")}
                rows={3}
                placeholder={t("fields.notesPlaceholder")}
                className={TEXTAREA_CLASS}
              />
            )}
          </CrmField>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
