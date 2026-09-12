"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { SearchableCombobox, type ComboboxItem } from "@/components/shared";
import { CrmField } from "./crm-field";
import { useOwnerOptions } from "@/lib/use-owner-options";
import { COMPANY_SOURCES, COMPANY_STATUSES } from "@/lib/api/crm-types";
import type { CompanyFormValues } from "@/lib/validation/crm-schemas";

const TEXTAREA_CLASS =
  "flex w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

/**
 * The company field set, shared by the create page and the edit dialog so the
 * two never drift. Consumes an RHF form; combobox fields are registered
 * imperatively and written back with `shouldValidate`.
 */
export function CompanyFormFields({
  form,
}: {
  form: UseFormReturn<CompanyFormValues>;
}) {
  const t = useTranslations("crm.form");
  const tStatus = useTranslations("crm.status.company");
  const tSource = useTranslations("crm.source");
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;

  React.useEffect(() => {
    register("status");
    register("source");
    register("ownerId");
  }, [register]);

  const status = useWatch({ control, name: "status" });
  const source = useWatch({ control, name: "source" });
  const ownerId = useWatch({ control, name: "ownerId" });

  const statusOptions: ComboboxItem[] = COMPANY_STATUSES.map((s) => ({
    value: s,
    label: tStatus(s),
  }));
  const sourceOptions: ComboboxItem[] = COMPANY_SOURCES.map((s) => ({
    value: s,
    label: tSource(s),
  }));
  const { options: ownerOptions } = useOwnerOptions();

  return (
    <div className="flex flex-col gap-4">
      <CrmField label={t("name")} required error={errors.name?.message}>
        {({ controlProps }) => (
          <Input
            {...controlProps}
            {...register("name")}
            placeholder={t("namePlaceholder")}
            autoFocus
          />
        )}
      </CrmField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CrmField label={t("sector")} required error={errors.sector?.message}>
          {({ controlProps }) => (
            <Input {...controlProps} {...register("sector")} placeholder={t("sectorPlaceholder")} />
          )}
        </CrmField>

        <CrmField label={t("status")} error={errors.status?.message}>
          {({ controlProps }) => (
            <SearchableCombobox
              id={controlProps.id}
              aria-label={t("status")}
              items={statusOptions}
              value={status || null}
              clearable={false}
              onValueChange={(v) => setValue("status", (v ?? "potencial") as CompanyFormValues["status"], { shouldValidate: true })}
            />
          )}
        </CrmField>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CrmField label={t("owner")} required error={errors.ownerId?.message}>
          {({ controlProps }) => (
            <SearchableCombobox
              id={controlProps.id}
              aria-label={t("owner")}
              items={ownerOptions}
              value={ownerId || null}
              onValueChange={(v) => setValue("ownerId", v ?? "", { shouldValidate: true })}
              placeholder={t("ownerPlaceholder")}
            />
          )}
        </CrmField>

        <CrmField label={t("source")} error={errors.source?.message}>
          {({ controlProps }) => (
            <SearchableCombobox
              id={controlProps.id}
              aria-label={t("source")}
              items={sourceOptions}
              value={source || null}
              clearable={false}
              onValueChange={(v) => setValue("source", (v ?? "other") as CompanyFormValues["source"], { shouldValidate: true })}
            />
          )}
        </CrmField>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CrmField label={t("website")} error={errors.website?.message}>
          {({ controlProps }) => (
            <Input {...controlProps} {...register("website")} inputMode="url" placeholder="https://" />
          )}
        </CrmField>
        <CrmField label={t("email")} error={errors.email?.message}>
          {({ controlProps }) => (
            <Input {...controlProps} {...register("email")} inputMode="email" placeholder={t("emailPlaceholder")} />
          )}
        </CrmField>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CrmField label={t("phone")} error={errors.phone?.message}>
          {({ controlProps }) => (
            <Input {...controlProps} {...register("phone")} inputMode="tel" placeholder="+351 ..." />
          )}
        </CrmField>
        <CrmField label={t("address")} error={errors.address?.message}>
          {({ controlProps }) => (
            <Input {...controlProps} {...register("address")} placeholder={t("addressPlaceholder")} />
          )}
        </CrmField>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CrmField label={t("nextAction")} error={errors.nextAction?.message}>
          {({ controlProps }) => (
            <Input {...controlProps} {...register("nextAction")} placeholder={t("nextActionPlaceholder")} />
          )}
        </CrmField>
        <CrmField label={t("nextActionAt")} error={errors.nextActionAt?.message}>
          {({ controlProps }) => <Input {...controlProps} {...register("nextActionAt")} type="date" />}
        </CrmField>
      </div>

      <CrmField label={t("description")} error={errors.description?.message}>
        {({ controlProps }) => (
          <textarea
            {...controlProps}
            {...register("description")}
            rows={3}
            placeholder={t("descriptionPlaceholder")}
            className={TEXTAREA_CLASS}
          />
        )}
      </CrmField>
    </div>
  );
}

/** Default form values, seeded from an existing company when editing. */
export function companyDefaults(
  company?: {
    name: string;
    status: CompanyFormValues["status"];
    sector: string;
    website: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    ownerId: string;
    source: CompanyFormValues["source"];
    description: string | null;
    nextAction: string | null;
    nextActionAt: string | null;
  } | null
): CompanyFormValues {
  return {
    name: company?.name ?? "",
    status: company?.status ?? "potencial",
    sector: company?.sector ?? "",
    website: company?.website ?? "",
    email: company?.email ?? "",
    phone: company?.phone ?? "",
    address: company?.address ?? "",
    ownerId: company?.ownerId ?? "",
    source: company?.source ?? "referral",
    description: company?.description ?? "",
    nextAction: company?.nextAction ?? "",
    nextActionAt: company?.nextActionAt ?? "",
  };
}

/** Map validated form values to the API input shape (empty → null). */
export function toCompanyInput(values: CompanyFormValues) {
  const nn = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    name: values.name.trim(),
    status: values.status,
    sector: values.sector.trim(),
    website: nn(values.website),
    email: nn(values.email),
    phone: nn(values.phone),
    address: nn(values.address),
    ownerId: values.ownerId,
    source: values.source,
    description: nn(values.description),
    nextAction: nn(values.nextAction),
    nextActionAt: nn(values.nextActionAt),
  };
}
