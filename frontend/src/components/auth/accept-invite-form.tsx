"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, Mail } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { toAuthErrorCode } from "@/lib/api/auth-error";
import type { AuthErrorCode, AuthResult, InviteInfo } from "@/lib/api/types";
import { zodResolver } from "@/lib/form/zod-resolver";
import {
  acceptInviteSchema,
  type AcceptInviteValues,
} from "@/lib/validation/auth-schemas";
import { persistPref } from "@/lib/client-prefs";
import { ROLE_COOKIE_KEY } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormField } from "./form-field";
import { PasswordInput } from "./password-input";
import { SubmitButton } from "./submit-button";
import { FormAlert } from "./form-alert";

const ROLE_BADGE: Record<InviteInfo["role"], "primary" | "signal" | "default"> = {
  admin: "signal",
  gestor: "primary",
  membro: "default",
};

export function AcceptInviteForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [errorCode, setErrorCode] = React.useState<AuthErrorCode | null>(null);

  const inviteQuery = useQuery({
    queryKey: ["invite", token],
    queryFn: () => authApi.getInvite(token),
    retry: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptInviteValues>({
    resolver: zodResolver(acceptInviteSchema((k) => t(`validation.${k}`))),
    defaultValues: { name: "", password: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: AcceptInviteValues) =>
      authApi.acceptInvite({
        token,
        name: values.name,
        password: values.password,
      }),
    onMutate: () => setErrorCode(null),
    onSuccess: (result: AuthResult) => {
      persistPref(ROLE_COOKIE_KEY, result.role);
      router.push("/");
      router.refresh();
    },
    onError: (error) => setErrorCode(toAuthErrorCode(error)),
  });

  // Loading the invite metadata.
  if (inviteQuery.isLoading) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t("invite.loading")}
      </div>
    );
  }

  // Invite token invalid / expired / revoked / already accepted.
  if (inviteQuery.isError || !inviteQuery.data) {
    const code = toAuthErrorCode(inviteQuery.error);
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="error" title={t(`errors.${code}`)} />
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

  const invite = inviteQuery.data;

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex flex-col gap-5"
    >
      {errorCode ? (
        <FormAlert tone="error" title={t(`errors.${errorCode}`)} />
      ) : null}

      {/* Read-only invite context: who was invited and with which role. */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">{t("invite.emailLabel")}</span>
          <span className="font-medium text-foreground">{invite.email}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("invite.roleLabel")}</span>
          <Badge variant={ROLE_BADGE[invite.role]}>{t(`roles.${invite.role}`)}</Badge>
        </div>
      </div>

      <FormField name="name" label={t("fields.name")} error={errors.name?.message}>
        {({ controlProps }) => (
          <Input
            type="text"
            autoComplete="name"
            autoFocus
            placeholder={t("placeholders.name")}
            {...controlProps}
            {...register("name")}
          />
        )}
      </FormField>

      <FormField
        name="password"
        label={t("fields.password")}
        error={errors.password?.message}
        hint={t("hints.passwordPolicy")}
      >
        {({ controlProps }) => (
          <PasswordInput
            autoComplete="new-password"
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

      <SubmitButton pending={mutation.isPending} pendingLabel={t("invite.submitting")}>
        {t("invite.submit")}
      </SubmitButton>
    </form>
  );
}
