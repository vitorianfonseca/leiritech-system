"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { toAuthErrorCode } from "@/lib/api/auth-error";
import type { AuthErrorCode } from "@/lib/api/types";
import { zodResolver } from "@/lib/form/zod-resolver";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "@/lib/validation/auth-schemas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "./form-field";
import { SubmitButton } from "./submit-button";
import { FormAlert } from "./form-alert";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [errorCode, setErrorCode] = React.useState<AuthErrorCode | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema((k) => t(`validation.${k}`))),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordValues) => authApi.forgotPassword(values),
    onMutate: () => setErrorCode(null),
    onSuccess: (_data, values) => setSentTo(values.email),
    onError: (error) => setErrorCode(toAuthErrorCode(error)),
  });

  if (sentTo) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert
          tone="success"
          title={t("forgot.successTitle")}
          description={t("forgot.successBody", { email: sentTo })}
        />
        <Button
          variant="ghost"
          className="h-10 w-full"
          nativeButton={false}
          render={<Link href="/login" />}
        >
          <ArrowLeft aria-hidden="true" />
          {t("actions.backToLogin")}
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex flex-col gap-5"
    >
      {errorCode ? (
        <FormAlert tone="error" title={t(`errors.${errorCode}`)} />
      ) : null}

      <FormField name="email" label={t("fields.email")} error={errors.email?.message}>
        {({ controlProps }) => (
          <Input
            type="email"
            autoComplete="email"
            autoFocus
            placeholder={t("placeholders.email")}
            {...controlProps}
            {...register("email")}
          />
        )}
      </FormField>

      <SubmitButton pending={mutation.isPending} pendingLabel={t("forgot.submitting")}>
        {t("forgot.submit")}
      </SubmitButton>

      <Button
        variant="ghost"
        size="sm"
        className="mx-auto"
        nativeButton={false}
        render={<Link href="/login" />}
      >
        <ArrowLeft aria-hidden="true" />
        {t("actions.backToLogin")}
      </Button>
    </form>
  );
}
