"use client";

import * as React from "react";
import { Package } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmField } from "@/components/crm/crm-field";
import { zodResolver } from "@/lib/form/zod-resolver";
import {
  catalogItemSchema,
  type CatalogItemFormValues,
} from "@/lib/validation/catalog-schemas";
import { parseEuroToCents } from "@/components/proposals/proposal-format";
import {
  BILLING_TYPES,
  CATALOG_UNITS,
  type CatalogItem,
  type CatalogItemInput,
} from "@/lib/api/catalog-types";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

export interface CatalogFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this item; otherwise it creates a new one. */
  item?: CatalogItem | null;
  onConfirm: (input: CatalogItemInput) => Promise<void>;
}

function centsToEuroString(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Create or edit a catalog item. Price is entered in euros and converted to
 * integer cents on submit; unit and billing type use native selects styled with
 * the design tokens (the project ships no shadcn Select primitive).
 */
export function CatalogFormDialog({
  open,
  onOpenChange,
  item,
  onConfirm,
}: CatalogFormDialogProps) {
  const t = useTranslations("catalog.form");
  const tv = useTranslations("catalog.validation");
  const tUnits = useTranslations("catalog.units");
  const tBilling = useTranslations("catalog.billing");
  const isEdit = Boolean(item);

  const defaults: CatalogItemFormValues = React.useMemo(
    () => ({
      name: item?.name ?? "",
      description: item?.description ?? "",
      category: item?.category ?? "",
      unit: item?.unit ?? "unit",
      price: item ? centsToEuroString(item.unitPrice) : "",
      taxRate: item?.taxRate ? item.taxRate.replace(".", ",") : "23,00",
      billingType: item?.billingType ?? "one_time",
    }),
    [item]
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CatalogItemFormValues>({
    resolver: zodResolver(catalogItemSchema((k) => tv(k))),
    defaultValues: defaults,
  });

  React.useEffect(() => {
    if (open) reset(defaults);
  }, [open, reset, defaults]);

  async function submit(values: CatalogItemFormValues) {
    const cents = parseEuroToCents(values.price);
    await onConfirm({
      name: values.name.trim(),
      description: values.description?.trim() ? values.description.trim() : null,
      category: values.category?.trim() ? values.category.trim() : null,
      unit: values.unit,
      unitPrice: cents ?? 0,
      taxRate: (values.taxRate || "23").replace(",", "."),
      billingType: values.billingType,
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
      <DialogContent className="max-w-lg">
        <DialogHeader
          icon={Package}
          title={isEdit ? t("editTitle") : t("createTitle")}
          description={t("subtitle")}
        />
        <form noValidate onSubmit={handleSubmit(submit)} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <CrmField label={t("fields.name")} required error={errors.name?.message}>
              {({ controlProps }) => (
                <Input {...controlProps} {...register("name")} placeholder={t("fields.namePlaceholder")} />
              )}
            </CrmField>

            <CrmField label={t("fields.description")} error={errors.description?.message}>
              {({ controlProps }) => (
                <textarea
                  {...controlProps}
                  {...register("description")}
                  rows={2}
                  placeholder={t("fields.descriptionPlaceholder")}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </CrmField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CrmField label={t("fields.category")} error={errors.category?.message}>
                {({ controlProps }) => (
                  <Input {...controlProps} {...register("category")} placeholder={t("fields.categoryPlaceholder")} />
                )}
              </CrmField>
              <CrmField label={t("fields.unit")} error={errors.unit?.message}>
                {({ controlProps }) => (
                  <select {...controlProps} {...register("unit")} className={SELECT_CLASS}>
                    {CATALOG_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {tUnits(u)}
                      </option>
                    ))}
                  </select>
                )}
              </CrmField>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <CrmField label={t("fields.price")} required error={errors.price?.message} hint={t("fields.priceHint")}>
                {({ controlProps }) => (
                  <Input {...controlProps} {...register("price")} inputMode="decimal" placeholder="0,00" />
                )}
              </CrmField>
              <CrmField label={t("fields.taxRate")} error={errors.taxRate?.message}>
                {({ controlProps }) => (
                  <Input {...controlProps} {...register("taxRate")} inputMode="decimal" placeholder="23,00" />
                )}
              </CrmField>
              <CrmField label={t("fields.billingType")} error={errors.billingType?.message}>
                {({ controlProps }) => (
                  <select {...controlProps} {...register("billingType")} className={SELECT_CLASS}>
                    {BILLING_TYPES.map((b) => (
                      <option key={b} value={b}>
                        {tBilling(b)}
                      </option>
                    ))}
                  </select>
                )}
              </CrmField>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : isEdit ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
