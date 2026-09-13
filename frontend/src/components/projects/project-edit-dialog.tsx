"use client";

import * as React from "react";
import { SquarePen } from "lucide-react";
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
import { useOwnerOptions } from "@/lib/use-owner-options";
import { parseEuroToCents } from "./project-format";
import { centsToEurosInput } from "@/lib/validation/finance-schemas";
import type { Project, UpdateProjectInput } from "@/lib/api/projects-types";

interface FormValues {
  name: string;
  description: string;
  managerId: string;
  startDate: string;
  dueDate: string;
  contractedValue: string;
  hoursBudget: string;
}

/**
 * Edit a project's own fields.
 *
 * Lifecycle and health are not here on purpose: both have their own controls
 * in the header and their own guards, and folding them into a form that says
 * "Save" would let someone cancel a project by editing its name.
 *
 * The financial fields only render for a caller who may see them (BR-008).
 * That is a convenience, not the enforcement — the server refuses the write
 * either way — but a field you can fill and cannot save is worse than one
 * that is not offered.
 */
export function ProjectEditDialog({
  open,
  onOpenChange,
  project,
  canFinance,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  canFinance: boolean;
  onSubmit: (input: UpdateProjectInput) => Promise<void>;
}) {
  const t = useTranslations("projects.editDialog");
  const { options: owners } = useOwnerOptions();

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: "",
      description: "",
      managerId: "",
      startDate: "",
      dueDate: "",
      contractedValue: "",
      hoursBudget: "",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    reset({
      name: project.name,
      description: project.description,
      managerId: project.managerId,
      startDate: project.startDate,
      dueDate: project.dueDate,
      contractedValue:
        project.contractedValueCents !== null
          ? centsToEurosInput(project.contractedValueCents)
          : "",
      hoursBudget: project.hoursBudget ? String(project.hoursBudget) : "",
    });
  }, [open, project, reset]);

  async function submit(values: FormValues) {
    const input: UpdateProjectInput = {
      name: values.name.trim(),
      description: values.description,
      managerId: values.managerId || null,
      startDate: values.startDate || null,
      dueDate: values.dueDate || null,
    };
    // Only send money when the caller may set it: an omitted key is left
    // alone by PATCH, so this cannot blank a value the user could not see.
    if (canFinance) {
      input.contractedValueCents = values.contractedValue
        ? parseEuroToCents(values.contractedValue)
        : null;
      input.hoursBudget = values.hoursBudget ? Number(values.hoursBudget) : null;
    }
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
      <DialogContent className="max-w-xl">
        <DialogHeader
          icon={SquarePen}
          title={t("title")}
          description={t("subtitle")}
        />
        <form noValidate onSubmit={handleSubmit(submit)} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <CrmField label={t("name")} required>
              {({ controlProps }) => <Input {...controlProps} {...register("name")} />}
            </CrmField>

            <CrmField label={t("description")}>
              {({ controlProps }) => (
                <textarea
                  {...controlProps}
                  {...register("description")}
                  rows={3}
                  className="glass-field w-full rounded-xl px-3 py-2 text-sm outline-none"
                  placeholder={t("descriptionPlaceholder")}
                />
              )}
            </CrmField>

            <CrmField label={t("manager")}>
              {({ controlProps }) => (
                <select
                  {...controlProps}
                  {...register("managerId")}
                  className="glass-field h-10 w-full rounded-xl px-3 text-sm outline-none"
                >
                  <option value="">{t("noManager")}</option>
                  {owners.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </CrmField>

            <div className="grid gap-4 sm:grid-cols-2">
              <CrmField label={t("startDate")}>
                {({ controlProps }) => (
                  <Input {...controlProps} {...register("startDate")} type="date" />
                )}
              </CrmField>
              <CrmField label={t("dueDate")}>
                {({ controlProps }) => (
                  <Input {...controlProps} {...register("dueDate")} type="date" />
                )}
              </CrmField>
            </div>

            {canFinance ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <CrmField label={t("contractedValue")}>
                  {({ controlProps }) => (
                    <Input
                      {...controlProps}
                      {...register("contractedValue")}
                      inputMode="decimal"
                      placeholder="0,00"
                    />
                  )}
                </CrmField>
                <CrmField label={t("hoursBudget")}>
                  {({ controlProps }) => (
                    <Input
                      {...controlProps}
                      {...register("hoursBudget")}
                      inputMode="numeric"
                      placeholder="0"
                    />
                  )}
                </CrmField>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
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
              {isSubmitting ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
