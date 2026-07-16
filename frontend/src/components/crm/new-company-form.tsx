"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-header";
import { toast } from "@/components/shared";
import { zodResolver } from "@/lib/form/zod-resolver";
import { companySchema, type CompanyFormValues } from "@/lib/validation/crm-schemas";
import { crmApi } from "@/lib/api/crm";
import {
  CompanyFormFields,
  companyDefaults,
  toCompanyInput,
} from "./company-form-fields";

export function NewCompanyForm({ user }: { user: { userId: string } }) {
  const t = useTranslations("crm.form");
  const tNew = useTranslations("crm.newPage");
  const tv = useTranslations("crm.validation");
  const router = useRouter();

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema((k) => tv(k))),
    defaultValues: { ...companyDefaults(), ownerId: user.userId },
  });
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  async function submit(values: CompanyFormValues) {
    const created = await crmApi.createCompany(toCompanyInput(values), user.userId);
    toast({ tone: "success", title: tNew("createdToast", { name: created.name }) });
    router.push(`/crm/companies/${created.id}`);
  }

  return (
    <div className="space-y-6">
      <Link
        href="/crm/companies"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
        {tNew("back")}
      </Link>

      <PageHeader title={tNew("title")} subtitle={tNew("subtitle")} />

      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <form noValidate onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
            <CompanyFormFields form={form} />
            <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={isSubmitting}
                nativeButton={false}
                render={<Link href="/crm/companies" />}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? t("saving") : t("saveCreate")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
