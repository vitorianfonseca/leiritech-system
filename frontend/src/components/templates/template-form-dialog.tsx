"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@/lib/form/zod-resolver";
import { templateSchema, type TemplateFormValues } from "@/lib/validation/template-schemas";
import {
  TEMPLATE_TYPES,
  type ProjectTemplate,
  type TemplateInput,
} from "@/lib/api/template-types";
import { TemplateField, TemplateSelect } from "./template-field";

export interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing template when editing; null when creating. */
  template: ProjectTemplate | null;
  onSubmit: (input: TemplateInput) => Promise<void>;
}

/**
 * Create / edit a template's metadata (F9). Client-side validation with visible
 * inline errors. Phases/tasks are edited on the template editor page.
 */
export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
  onSubmit,
}: TemplateFormDialogProps) {
  const t = useTranslations("templates");
  const tv = useTranslations("templates.validation");
  const tt = useTranslations("templates.types");
  const isEdit = template !== null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema((k) => tv(k))),
    defaultValues: {
      name: "",
      type: "website",
      description: "",
      expectedDurationDays: "30",
      active: true,
    },
  });

  React.useEffect(() => {
    if (!open) return;
    reset({
      name: template?.name ?? "",
      type: template?.type ?? "website",
      description: template?.description ?? "",
      expectedDurationDays: String(template?.expectedDurationDays ?? 30),
      active: template?.active ?? true,
    });
  }, [open, template, reset]);

  async function submit(values: TemplateFormValues) {
    const input: TemplateInput = {
      name: values.name.trim(),
      type: values.type,
      description: values.description.trim(),
      expectedDurationDays: Number(values.expectedDurationDays),
      active: values.active,
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
      <DialogContent className="max-w-lg p-6">
        <div className="space-y-1.5">
          <DialogTitle>{isEdit ? t("form.editTitle") : t("form.createTitle")}</DialogTitle>
          <DialogDescription>{t("form.subtitle")}</DialogDescription>
        </div>

        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <TemplateField label={t("form.name")} required error={errors.name?.message}>
            {({ controlProps }) => (
              <Input
                {...controlProps}
                {...register("name")}
                placeholder={t("form.namePlaceholder")}
                autoFocus
              />
            )}
          </TemplateField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TemplateField label={t("form.type")} error={errors.type?.message}>
              {({ controlProps }) => (
                <TemplateSelect {...controlProps} {...register("type")}>
                  {TEMPLATE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {tt(type)}
                    </option>
                  ))}
                </TemplateSelect>
              )}
            </TemplateField>

            <TemplateField
              label={t("form.expectedDuration")}
              hint={t("form.expectedDurationHint")}
              error={errors.expectedDurationDays?.message}
            >
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  {...register("expectedDurationDays")}
                  inputMode="numeric"
                  placeholder="30"
                />
              )}
            </TemplateField>
          </div>

          <TemplateField label={t("form.description")} required error={errors.description?.message}>
            {({ controlProps }) => (
              <textarea
                {...controlProps}
                {...register("description")}
                rows={3}
                placeholder={t("form.descriptionPlaceholder")}
                className="flex w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
              />
            )}
          </TemplateField>

          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              {...register("active")}
              className="size-4 rounded border-input text-signal accent-signal focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span>
              {t("form.active")}
              <span className="ml-1.5 text-xs text-muted-foreground">{t("form.activeHint")}</span>
            </span>
          </label>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("form.saving") : isEdit ? t("form.saveEdit") : t("form.saveCreate")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
