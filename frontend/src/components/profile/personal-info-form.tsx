"use client";

import * as React from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Upload, Trash2, Save, TriangleAlert, RefreshCw } from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, SkeletonCard, toast } from "@/components/shared";
import { zodResolver } from "@/lib/form/zod-resolver";
import {
  personalProfileSchema,
  type PersonalProfileFormValues,
} from "@/lib/validation/profile-schemas";
import { profileApi } from "@/lib/api/profile";
import { ProfileError } from "@/lib/api/profile-types";
import { ProfileField } from "./profile-field";

const MAX_AVATAR_BYTES = 512 * 1024;

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function PersonalInfoForm({ user }: { user: SessionUser }) {
  const t = useTranslations("profile.personal");
  const tv = useTranslations("profile.validation");
  const tErr = useTranslations("profile.errors");
  const tRoles = useTranslations("roles");

  const query = useQuery({
    queryKey: ["profile", user.id],
    queryFn: () => profileApi.getProfile(user),
  });

  const [avatar, setAvatar] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<PersonalProfileFormValues>({
    resolver: zodResolver(personalProfileSchema((k) => tv(k))),
    defaultValues: { name: "", email: "", phone: "" },
  });

  const [seeded, setSeeded] = React.useState(false);
  if (query.data && !seeded) {
    setSeeded(true);
    reset({ name: query.data.name, email: query.data.email, phone: query.data.phone });
    setAvatar(query.data.avatarDataUrl);
  }

  function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ tone: "destructive", title: tErr("avatarType") });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast({ tone: "destructive", title: tErr("avatarSize") });
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setAvatar(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  async function onSubmit(values: PersonalProfileFormValues) {
    try {
      setSaving(true);
      const next = await profileApi.updateProfile(user, {
        name: values.name,
        email: values.email,
        phone: values.phone ?? "",
        avatarDataUrl: avatar,
      });
      reset({ name: next.name, email: next.email, phone: next.phone });
      setAvatar(next.avatarDataUrl);
      query.refetch();
      toast({ tone: "success", title: t("saved") });
    } catch (err) {
      const key =
        err instanceof ProfileError && err.detailKey ? err.detailKey : undefined;
      toast({
        tone: "destructive",
        title: tErr("saveFailed"),
        description: key ? safe(tv, key) : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  if (query.isError) {
    return (
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
    );
  }

  if (query.isLoading || !seeded) {
    return <SkeletonCard lines={6} />;
  }

  const dirty = isDirty || (query.data ? avatar !== query.data.avatarDataUrl : false);
  const displayName = query.data?.name || user.name;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {/* Avatar */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-16 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/40 text-lg font-medium text-muted-foreground">
          {avatar ? (
            <Image
              src={avatar}
              alt={t("avatar.previewAlt")}
              width={64}
              height={64}
              className="size-full object-cover"
              unoptimized
            />
          ) : (
            <span aria-hidden>{initials(displayName)}</span>
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={t("avatar.upload")}
            onChange={onPickAvatar}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            <Upload aria-hidden />
            {t("avatar.upload")}
          </Button>
          {avatar ? (
            <Button type="button" variant="ghost" onClick={() => setAvatar(null)}>
              <Trash2 aria-hidden />
              {t("avatar.remove")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ProfileField label={t("fields.name")} error={errors.name?.message} required>
          <Input {...register("name")} aria-invalid={Boolean(errors.name)} />
        </ProfileField>
        <ProfileField label={t("fields.email")} error={errors.email?.message} required>
          <Input
            type="email"
            autoComplete="email"
            {...register("email")}
            aria-invalid={Boolean(errors.email)}
          />
        </ProfileField>
        <ProfileField
          label={t("fields.phone")}
          error={errors.phone?.message}
          hint={t("fields.phoneHint")}
        >
          <Input
            type="tel"
            autoComplete="tel"
            {...register("phone")}
            aria-invalid={Boolean(errors.phone)}
          />
        </ProfileField>
        {/* Role — read-only, Admin-managed (matrix §3) */}
        <div className="space-y-1.5">
          <span className="text-sm font-medium leading-none text-foreground">
            {t("fields.role")}
          </span>
          <div className="flex h-10 items-center gap-2">
            <Badge variant="signal">{tRoles(query.data!.role)}</Badge>
            <span className="text-xs text-muted-foreground">{t("fields.roleNote")}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={!dirty || saving}>
          <Save aria-hidden />
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}

function safe(t: (key: string) => string, key: string): string | undefined {
  try {
    return t(key);
  } catch {
    return undefined;
  }
}
