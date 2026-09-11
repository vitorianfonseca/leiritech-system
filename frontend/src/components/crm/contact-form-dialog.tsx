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
import { CrmField } from "./crm-field";
import { zodResolver } from "@/lib/form/zod-resolver";
import { contactSchema, type ContactFormValues } from "@/lib/validation/crm-schemas";
import { crmApi, CRM_OWNERS } from "@/lib/api/crm";
import type { Contact, ContactInput } from "@/lib/api/crm-types";
import type { Role } from "@/lib/session";

const TEXTAREA_CLASS =
  "flex w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing contact when editing; null for create. */
  contact: Contact | null;
  /** Preselect a company (e.g. opened from a company's detail page). */
  defaultCompanyId?: string | null;
  user: { role: Role; userId: string; paymentsGrant: boolean };
  onSubmit: (input: ContactInput) => Promise<void>;
}

function defaults(contact: Contact | null, fallbackCompanyId: string): ContactFormValues {
  if (!contact) {
    return {
      name: "",
      companyId: fallbackCompanyId,
      ownerId: "",
      status: "active",
      role: "",
      email: "",
      phone: "",
      notes: "",
    };
  }
  return {
    name: contact.name,
    companyId: contact.companyId,
    ownerId: contact.ownerId,
    status: contact.status,
    role: contact.role ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    notes: contact.notes ?? "",
  };
}

/**
 * Create / edit a contact (H9 fix). Same field-set for both flows so they
 * never drift; the company/owner pickers reuse the CRM combobox pattern from
 * the opportunity + company forms.
 */
export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  defaultCompanyId = null,
  user,
  onSubmit,
}: ContactFormDialogProps) {
  const t = useTranslations("crm.contactForm");
  const tv = useTranslations("crm.validation");
  const tStatus = useTranslations("crm.status.contact");
  const isEdit = contact !== null;

  const companiesQuery = useQuery({
    queryKey: ["crm", "companies", "options", user.role, user.userId],
    queryFn: () =>
      crmApi.listCompanies({
        role: user.role,
        userId: user.userId,
        paymentsGrant: user.paymentsGrant,
      }),
    enabled: open,
  });

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema((k) => tv(k))),
    defaultValues: defaults(null, defaultCompanyId ?? ""),
  });
  const {
    register,
    control,
    setValue,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  React.useEffect(() => {
    register("companyId");
    register("ownerId");
    register("status");
  }, [register]);

  React.useEffect(() => {
    if (!open) return;
    reset(defaults(contact, defaultCompanyId ?? ""));
  }, [open, contact, defaultCompanyId, reset]);

  const companyId = useWatch({ control, name: "companyId" });
  const ownerId = useWatch({ control, name: "ownerId" });
  const status = useWatch({ control, name: "status" });

  const companyOptions: ComboboxItem[] = (companiesQuery.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const ownerOptions: ComboboxItem[] = CRM_OWNERS.map((o) => ({ value: o.id, label: o.name }));
  const statusOptions: ComboboxItem[] = (["active", "inactive"] as const).map((s) => ({
    value: s,
    label: tStatus(s),
  }));

  async function submit(values: ContactFormValues) {
    const nn = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
    await onSubmit({
      name: values.name.trim(),
      role: nn(values.role),
      email: nn(values.email),
      phone: nn(values.phone),
      companyId: values.companyId,
      ownerId: values.ownerId,
      status: values.status,
      notes: nn(values.notes),
    });
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
          <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </div>

        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <CrmField label={t("fields.name")} required error={errors.name?.message}>
            {({ controlProps }) => (
              <Input
                {...controlProps}
                {...register("name")}
                placeholder={t("fields.namePlaceholder")}
                autoFocus
              />
            )}
          </CrmField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CrmField label={t("fields.company")} required error={errors.companyId?.message}>
              {({ controlProps }) => (
                <SearchableCombobox
                  id={controlProps.id}
                  aria-label={t("fields.company")}
                  items={companyOptions}
                  loading={companiesQuery.isPending}
                  value={companyId || null}
                  placeholder={t("fields.companyPlaceholder")}
                  emptyMessage={t("fields.noCompanies")}
                  onValueChange={(v) => setValue("companyId", v ?? "", { shouldValidate: true })}
                />
              )}
            </CrmField>
            <CrmField label={t("fields.owner")} required error={errors.ownerId?.message}>
              {({ controlProps }) => (
                <SearchableCombobox
                  id={controlProps.id}
                  aria-label={t("fields.owner")}
                  items={ownerOptions}
                  value={ownerId || null}
                  placeholder={t("fields.ownerPlaceholder")}
                  onValueChange={(v) => setValue("ownerId", v ?? "", { shouldValidate: true })}
                />
              )}
            </CrmField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CrmField label={t("fields.role")} error={errors.role?.message}>
              {({ controlProps }) => (
                <Input {...controlProps} {...register("role")} placeholder={t("fields.rolePlaceholder")} />
              )}
            </CrmField>
            <CrmField label={t("fields.status")} error={errors.status?.message}>
              {({ controlProps }) => (
                <SearchableCombobox
                  id={controlProps.id}
                  aria-label={t("fields.status")}
                  items={statusOptions}
                  value={status || null}
                  clearable={false}
                  onValueChange={(v) =>
                    setValue("status", (v ?? "active") as ContactFormValues["status"], {
                      shouldValidate: true,
                    })
                  }
                />
              )}
            </CrmField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CrmField label={t("fields.email")} error={errors.email?.message}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  {...register("email")}
                  inputMode="email"
                  placeholder={t("fields.emailPlaceholder")}
                />
              )}
            </CrmField>
            <CrmField label={t("fields.phone")} error={errors.phone?.message}>
              {({ controlProps }) => (
                <Input {...controlProps} {...register("phone")} inputMode="tel" placeholder="+351 ..." />
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
                className={TEXTAREA_CLASS}
              />
            )}
          </CrmField>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : isEdit ? t("saveEdit") : t("saveCreate")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
