"use client";

import * as React from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Upload, Trash2, Save, TriangleAlert, RefreshCw, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, SkeletonCard, toast } from "@/components/shared";
import { zodResolver } from "@/lib/form/zod-resolver";
import {
  leiritechProfileSchema,
  type LeiritechProfileFormValues,
} from "@/lib/validation/settings-schemas";
import { settingsApi } from "@/lib/api/settings";
import { SettingsError } from "@/lib/api/settings-types";
import type { Role } from "@/lib/session";

export interface LeiritechSettingsViewProps {
  role: Role;
}

const MAX_LOGO_BYTES = 512 * 1024;

export function LeiritechSettingsView({ role }: LeiritechSettingsViewProps) {
  const t = useTranslations("settings.leiritech");
  const tv = useTranslations("settings.leiritech.validation");
  const tErr = useTranslations("settings.leiritech.errors");

  const query = useQuery({
    queryKey: ["settings-leiritech"],
    queryFn: () => settingsApi.getLeiritechProfile(),
  });

  const [logo, setLogo] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<LeiritechProfileFormValues>({
    resolver: zodResolver(leiritechProfileSchema((k) => tv(k))),
    defaultValues: {
      name: "",
      tagline: "",
      email: "",
      phone: "",
      website: "",
      addressLine: "",
      city: "",
      postalCode: "",
      country: "",
    },
  });

  // Seed the form + logo once the profile loads.
  const [seeded, setSeeded] = React.useState(false);
  if (query.data && !seeded) {
    setSeeded(true);
    const { logoDataUrl, ...fields } = query.data;
    reset(fields);
    setLogo(logoDataUrl);
  }

  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ tone: "destructive", title: tErr("logoType") });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast({ tone: "destructive", title: tErr("logoSize") });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  async function onSubmit(values: LeiritechProfileFormValues) {
    try {
      setSaving(true);
      await settingsApi.updateLeiritechProfile(role, {
        name: values.name,
        tagline: values.tagline ?? "",
        email: values.email ?? "",
        phone: values.phone ?? "",
        website: values.website ?? "",
        addressLine: values.addressLine ?? "",
        city: values.city ?? "",
        postalCode: values.postalCode ?? "",
        country: values.country ?? "",
        logoDataUrl: logo,
      });
      reset(values);
      toast({ tone: "success", title: t("saved") });
    } catch (err) {
      const key = err instanceof SettingsError && err.detailKey ? err.detailKey : "saveFailed";
      toast({ tone: "destructive", title: tErr("saveFailed"), description: safe(tv, key) });
    } finally {
      setSaving(false);
    }
  }

  if (query.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <EmptyState
          icon={TriangleAlert}
          title={tErr("loadTitle")}
          description={tErr("loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => query.refetch()}>
              <RefreshCw aria-hidden />
              {tErr("retry")}
            </Button>
          }
        />
      </div>
    );
  }

  const dirty = isDirty || (query.data ? logo !== query.data.logoDataUrl : false);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button type="submit" disabled={!dirty || saving}>
            <Save aria-hidden />
            {saving ? t("saving") : t("save")}
          </Button>
        }
      />

      {query.isLoading ? (
        <SkeletonCard lines={6} />
      ) : (
        <>
          {/* Logo */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-heading text-base font-semibold text-foreground">{t("logo.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("logo.description")}</p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <span className="flex size-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
                {logo ? (
                  <Image
                    src={logo}
                    alt={t("logo.previewAlt")}
                    width={64}
                    height={64}
                    className="size-full object-contain"
                    unoptimized
                  />
                ) : (
                  <Building2 className="size-7 text-muted-foreground" strokeWidth={1.6} aria-hidden />
                )}
              </span>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label={t("logo.upload")}
                  onChange={onPickLogo}
                />
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload aria-hidden />
                  {t("logo.upload")}
                </Button>
                {logo ? (
                  <Button type="button" variant="ghost" onClick={() => setLogo(null)}>
                    <Trash2 aria-hidden />
                    {t("logo.remove")}
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          {/* Identity */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-heading text-base font-semibold text-foreground">{t("identity.title")}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t("fields.name")} error={errors.name?.message} required>
                <Input {...register("name")} aria-invalid={Boolean(errors.name)} />
              </Field>
              <Field label={t("fields.tagline")} error={errors.tagline?.message}>
                <Input {...register("tagline")} aria-invalid={Boolean(errors.tagline)} />
              </Field>
              <Field label={t("fields.email")} error={errors.email?.message}>
                <Input type="email" {...register("email")} aria-invalid={Boolean(errors.email)} />
              </Field>
              <Field label={t("fields.phone")} error={errors.phone?.message}>
                <Input {...register("phone")} aria-invalid={Boolean(errors.phone)} />
              </Field>
              <Field label={t("fields.website")} error={errors.website?.message} className="sm:col-span-2">
                <Input {...register("website")} placeholder="https://" aria-invalid={Boolean(errors.website)} />
              </Field>
            </div>
          </section>

          {/* Address */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-heading text-base font-semibold text-foreground">{t("address.title")}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t("fields.addressLine")} error={errors.addressLine?.message} className="sm:col-span-2">
                <Input {...register("addressLine")} aria-invalid={Boolean(errors.addressLine)} />
              </Field>
              <Field label={t("fields.city")} error={errors.city?.message}>
                <Input {...register("city")} aria-invalid={Boolean(errors.city)} />
              </Field>
              <Field label={t("fields.postalCode")} error={errors.postalCode?.message}>
                <Input {...register("postalCode")} aria-invalid={Boolean(errors.postalCode)} />
              </Field>
              <Field label={t("fields.country")} error={errors.country?.message}>
                <Input {...register("country")} aria-invalid={Boolean(errors.country)} />
              </Field>
            </div>
          </section>
        </>
      )}
    </form>
  );
}

function Field({
  label,
  error,
  required,
  className,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className={className}>
      <div className="space-y-1.5">
        <Label htmlFor={id}>
          {label}
          {required ? <span className="text-gold">*</span> : null}
        </Label>
        {React.isValidElement(children)
          ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id })
          : children}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function safe(t: (key: string) => string, key: string): string {
  try {
    return t(key);
  } catch {
    return t("nameRequired");
  }
}
