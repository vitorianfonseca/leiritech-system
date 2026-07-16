"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, toast } from "@/components/shared";
import { PasswordInput } from "@/components/auth/password-input";
import { zodResolver } from "@/lib/form/zod-resolver";
import {
  changePasswordSchema,
  type ChangePasswordFormValues,
} from "@/lib/validation/profile-schemas";
import { profileApi } from "@/lib/api/profile";
import { ProfileError } from "@/lib/api/profile-types";
import { ProfileField } from "./profile-field";

export function SecuritySection({ user }: { user: SessionUser }) {
  const t = useTranslations("profile.security");
  const tv = useTranslations("profile.validation");
  const tErr = useTranslations("profile.errors");

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingValues, setPendingValues] =
    React.useState<ChangePasswordFormValues | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema((k) => tv(k))),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  function onValid(values: ChangePasswordFormValues) {
    setPendingValues(values);
    setConfirmOpen(true);
  }

  async function onConfirm() {
    if (!pendingValues) return;
    try {
      await profileApi.changePassword(user, {
        currentPassword: pendingValues.currentPassword,
        newPassword: pendingValues.newPassword,
      });
      reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPendingValues(null);
      toast({ tone: "success", title: t("changed") });
    } catch (err) {
      const key =
        err instanceof ProfileError && err.detailKey ? err.detailKey : undefined;
      toast({
        tone: "destructive",
        title: tErr("passwordFailed"),
        description: key ? safe(tv, key) : undefined,
      });
      // Keep the pending values + form so the user can retry; re-throw so the
      // ConfirmDialog stays open on failure.
      throw err;
    }
  }

  return (
    <div className="space-y-8">
      {/* Change password */}
      <div className="space-y-3">
        <div>
          <h3 className="font-heading text-base font-semibold text-foreground">
            {t("password.title")}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("password.description")}
          </p>
        </div>
        <form
          onSubmit={handleSubmit(onValid)}
          noValidate
          className="grid max-w-xl gap-4"
        >
          <ProfileField
            label={t("password.current")}
            error={errors.currentPassword?.message}
            required
          >
            <PasswordInput
              autoComplete="current-password"
              toggleShowLabel={t("password.show")}
              toggleHideLabel={t("password.hide")}
              {...register("currentPassword")}
              aria-invalid={Boolean(errors.currentPassword)}
            />
          </ProfileField>
          <ProfileField
            label={t("password.new")}
            error={errors.newPassword?.message}
            hint={t("password.hint")}
            required
          >
            <PasswordInput
              autoComplete="new-password"
              toggleShowLabel={t("password.show")}
              toggleHideLabel={t("password.hide")}
              {...register("newPassword")}
              aria-invalid={Boolean(errors.newPassword)}
            />
          </ProfileField>
          <ProfileField
            label={t("password.confirm")}
            error={errors.confirmPassword?.message}
            required
          >
            <PasswordInput
              autoComplete="new-password"
              toggleShowLabel={t("password.show")}
              toggleHideLabel={t("password.hide")}
              {...register("confirmPassword")}
              aria-invalid={Boolean(errors.confirmPassword)}
            />
          </ProfileField>
          <div className="flex justify-end">
            <Button type="submit" disabled={!isDirty}>
              <KeyRound aria-hidden />
              {t("password.submit")}
            </Button>
          </div>
        </form>
      </div>

      {/* Session */}
      <div className="space-y-3">
        <div>
          <h3 className="font-heading text-base font-semibold text-foreground">
            {t("session.title")}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("session.description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-success-muted text-success">
              <ShieldCheck className="size-5" strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-foreground">{user.email}</p>
              <p className="text-sm text-muted-foreground">{t("session.active")}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="lg"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            <LogOut aria-hidden />
            {t("session.logout")}
          </Button>
        </div>
      </div>

      {/* Deactivate own account — Admin-managed, not self-serve (§1.11) */}
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">{t("deactivate.note")}</p>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant="destructive"
        title={t("password.confirmTitle")}
        description={t("password.confirmDescription")}
        confirmLabel={t("password.submit")}
        onConfirm={onConfirm}
      />
    </div>
  );
}

function safe(t: (key: string) => string, key: string): string | undefined {
  try {
    return t(key);
  } catch {
    return undefined;
  }
}
