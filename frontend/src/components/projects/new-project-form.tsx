"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shell/page-header";
import { SearchableCombobox, toast, type ComboboxItem } from "@/components/shared";
import { CrmField } from "@/components/crm/crm-field";
import { zodResolver } from "@/lib/form/zod-resolver";
import {
  createProjectSchema,
  type CreateProjectFormValues,
} from "@/lib/validation/project-schemas";
import { crmApi } from "@/lib/api/crm";
import { projectsApi, projectRoutes, PROJECT_MANAGERS } from "@/lib/api/projects";
import type { Role } from "@/lib/session";
import { parseEuroToCents } from "./project-format";

export interface NewProjectFormProps {
  user: { role: Role; userId: string; paymentsGrant: boolean };
  canFinance: boolean;
}

const DEFAULTS: CreateProjectFormValues = {
  name: "",
  clientId: "",
  managerId: "",
  description: "",
  startDate: "",
  dueDate: "",
  hoursBudget: "",
  value: "",
};

/**
 * /projects/new — create a project (F8). Commercial/delivery write action,
 * limited to Admin / Gestor. Created in `planning`; lifecycle + phases + team
 * are managed from the detail page. Value is finance-gated (BR-008).
 */
export function NewProjectForm({ user, canFinance }: NewProjectFormProps) {
  const t = useTranslations("projects.newPage");
  const tf = useTranslations("projects.form");
  const tv = useTranslations("projects.validation");
  const router = useRouter();

  const companiesQuery = useQuery({
    queryKey: ["crm", "companies", "options", user.role, user.userId, user.paymentsGrant],
    queryFn: () =>
      crmApi.listCompanies({
        role: user.role,
        userId: user.userId,
        paymentsGrant: user.paymentsGrant,
      }),
  });

  const {
    control,
    setValue,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectFormValues>({
    resolver: zodResolver(createProjectSchema((k) => tv(k))),
    defaultValues: { ...DEFAULTS, managerId: user.userId },
  });

  React.useEffect(() => {
    register("clientId");
    register("managerId");
  }, [register]);

  React.useEffect(() => {
    reset({ ...DEFAULTS, managerId: user.userId });
  }, [reset, user.userId]);

  const clientId = useWatch({ control, name: "clientId" });
  const managerId = useWatch({ control, name: "managerId" });

  const companyOptions: ComboboxItem[] = (companiesQuery.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const managerOptions: ComboboxItem[] = PROJECT_MANAGERS.map((m) => ({
    value: m.id,
    label: m.name,
  }));

  async function submit(values: CreateProjectFormValues) {
    const clientName =
      companyOptions.find((c) => c.value === values.clientId)?.label ?? values.clientId;
    const created = await projectsApi.createProject(
      {
        name: values.name,
        clientId: values.clientId,
        clientName,
        managerId: values.managerId,
        description: values.description ?? "",
        startDate: values.startDate,
        dueDate: values.dueDate,
        hoursBudget: Number(values.hoursBudget),
        contractedValueCents:
          canFinance && values.value ? parseEuroToCents(values.value) : null,
      },
      user.userId,
      canFinance
    );
    toast({ tone: "success", title: t("createdToast", { name: created.name }) });
    router.push(projectRoutes.detail(created.id));
  }

  return (
    <div className="space-y-6">
      <Link
        href={projectRoutes.list()}
        className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
        {t("back")}
      </Link>

      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <form noValidate onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
            <CrmField label={tf("name")} required error={errors.name?.message}>
              {({ controlProps }) => (
                <Input {...controlProps} {...register("name")} placeholder={tf("namePlaceholder")} />
              )}
            </CrmField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CrmField label={tf("client")} required error={errors.clientId?.message}>
                {({ controlProps }) => (
                  <SearchableCombobox
                    id={controlProps.id}
                    aria-label={tf("client")}
                    items={companyOptions}
                    loading={companiesQuery.isPending}
                    value={clientId || null}
                    placeholder={tf("clientPlaceholder")}
                    emptyMessage={tf("noClients")}
                    onValueChange={(v) => setValue("clientId", v ?? "", { shouldValidate: true })}
                  />
                )}
              </CrmField>

              <CrmField label={tf("manager")} required error={errors.managerId?.message}>
                {({ controlProps }) => (
                  <SearchableCombobox
                    id={controlProps.id}
                    aria-label={tf("manager")}
                    items={managerOptions}
                    value={managerId || null}
                    placeholder={tf("managerPlaceholder")}
                    emptyMessage={tf("noManagers")}
                    onValueChange={(v) => setValue("managerId", v ?? "", { shouldValidate: true })}
                  />
                )}
              </CrmField>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CrmField label={tf("startDate")} required error={errors.startDate?.message}>
                {({ controlProps }) => (
                  <Input {...controlProps} {...register("startDate")} type="date" />
                )}
              </CrmField>
              <CrmField label={tf("dueDate")} required error={errors.dueDate?.message}>
                {({ controlProps }) => (
                  <Input {...controlProps} {...register("dueDate")} type="date" />
                )}
              </CrmField>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CrmField label={tf("hoursBudget")} required error={errors.hoursBudget?.message} hint={tf("hoursHint")}>
                {({ controlProps }) => (
                  <Input
                    {...controlProps}
                    {...register("hoursBudget")}
                    inputMode="numeric"
                    placeholder={tf("hoursPlaceholder")}
                  />
                )}
              </CrmField>
              {canFinance ? (
                <CrmField label={tf("value")} error={errors.value?.message} hint={tf("valueHint")}>
                  {({ controlProps }) => (
                    <Input
                      {...controlProps}
                      {...register("value")}
                      inputMode="decimal"
                      placeholder={tf("valuePlaceholder")}
                    />
                  )}
                </CrmField>
              ) : null}
            </div>

            <CrmField label={tf("description")} error={errors.description?.message}>
              {({ controlProps }) => (
                <textarea
                  {...controlProps}
                  {...register("description")}
                  rows={3}
                  placeholder={tf("descriptionPlaceholder")}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
                />
              )}
            </CrmField>

            <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={isSubmitting}
                nativeButton={false}
                render={<Link href={projectRoutes.list()} />}
              >
                {tf("cancel")}
              </Button>
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? tf("saving") : tf("saveCreate")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
