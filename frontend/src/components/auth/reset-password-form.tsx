"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { authApi } from "@/lib/api/auth";
import { toAuthErrorCode } from "@/lib/api/auth-error";
import type { AuthErrorCode } from "@/lib/api/types";
import { zodResolver } from "@/lib/form/zod-resolver";
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "@/lib/validation/auth-schemas";
import { Button } from "@/components/ui/button";
import { FormField } from "./form-field";
import { PasswordInput } from "./password-input";
import { SubmitButton } from "./submit-button";
import { FormAlert } from "./form-alert";

/** Codes that mean the link itself is dead — offer a fresh request, not retry. */
const DEAD_LINK_CODES: AuthErrorCode[] = ["reset_invalid", "reset_expired"];

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [errorCode, setErrorCode] = React.useState<AuthErrorCode | null>(null);
  const [done, setDone] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema((k) => t(`validation.${k}`))),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ResetPasswordValues) =>
      authApi.resetPassword({ token, password: values.password }),
    onMutate: () => setErrorCode(null),
    onSuccess: () => setDone(true),
    onError: (error) => setErrorCode(toAuthErrorCode(error)),
  });

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert
          tone="success"
          title={t("reset.successTitle")}
          description={t("reset.successBody")}
        />
        <Button
          className="h-10 w-full"
          nativeButton={false}
          render={<Link href="/login" />}
        >
          {t("actions.goToLogin")}
        </Button>
      </div>
    );
  }

  const deadLink = errorCode !== null && DEAD_LINK_CODES.includes(errorCode);

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex flex-col gap-5"
    >
      {errorCode ? (
        <FormAlert tone="error" title={t(`errors.${errorCode}`)} />
      ) : null}

      {deadLink ? (
        <Button
          className="h-10 w-full"
          nativeButton={false}
          render={<Link href="/forgot-password" />}
        >
          {t("reset.requestNew")}
        </Button>
      ) : (
        <>
          <FormField
            name="password"
            label={t("fields.newPassword")}
            error={errors.password?.message}
            hint={t("hints.passwordPolicy")}
          >
            {({ controlProps }) => (
              <PasswordInput
                autoComplete="new-password"
                autoFocus
                placeholder={t("placeholders.newPassword")}
                toggleShowLabel={t("actions.showPassword")}
                toggleHideLabel={t("actions.hidePassword")}
                {...controlProps}
                {...register("password")}
              />
            )}
          </FormField>

          <FormField
            name="confirmPassword"
            label={t("fields.confirmPassword")}
            error={errors.confirmPassword?.message}
          >
            {({ controlProps }) => (
              <PasswordInput
                autoComplete="new-password"
                placeholder={t("placeholders.confirmPassword")}
                toggleShowLabel={t("actions.showPassword")}
                toggleHideLabel={t("actions.hidePassword")}
                {...controlProps}
                {...register("confirmPassword")}
              />
            )}
          </FormField>

          <SubmitButton
            pending={mutation.isPending}
            pendingLabel={t("reset.submitting")}
          >
            {t("reset.submit")}
          </SubmitButton>
        </>
      )}
    </form>
  );
}
