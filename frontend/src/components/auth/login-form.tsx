"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { authApi } from "@/lib/api/auth";
import { toAuthErrorCode } from "@/lib/api/auth-error";
import type { AuthErrorCode, AuthResult } from "@/lib/api/types";
import { zodResolver } from "@/lib/form/zod-resolver";
import { loginSchema, type LoginValues } from "@/lib/validation/auth-schemas";
import { persistPref } from "@/lib/client-prefs";
import { ROLE_COOKIE_KEY } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { FormField } from "./form-field";
import { PasswordInput } from "./password-input";
import { SubmitButton } from "./submit-button";
import { FormAlert } from "./form-alert";

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [errorCode, setErrorCode] = React.useState<AuthErrorCode | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema((k) => t(`validation.${k}`))),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: LoginValues) => authApi.login(values),
    onMutate: () => setErrorCode(null),
    onSuccess: (result: AuthResult) => {
      // Dev session: persist the role cookie read by getSession() (src/lib/session.ts).
      persistPref(ROLE_COOKIE_KEY, result.role);
      router.push("/");
      router.refresh();
    },
    onError: (error) => setErrorCode(toAuthErrorCode(error)),
  });

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

      <FormField
        name="password"
        label={t("fields.password")}
        error={errors.password?.message}
      >
        {({ controlProps }) => (
          <PasswordInput
            autoComplete="current-password"
            placeholder={t("placeholders.password")}
            toggleShowLabel={t("actions.showPassword")}
            toggleHideLabel={t("actions.hidePassword")}
            {...controlProps}
            {...register("password")}
          />
        )}
      </FormField>

      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          {t("login.forgotLink")}
        </Link>
      </div>

      <SubmitButton pending={mutation.isPending} pendingLabel={t("login.submitting")}>
        {t("login.submit")}
      </SubmitButton>
    </form>
  );
}
