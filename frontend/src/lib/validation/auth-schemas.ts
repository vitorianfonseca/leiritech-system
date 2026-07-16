import { z } from "zod";

/**
 * Auth form schemas. Built as factories that receive a `field` translator so
 * validation messages are i18n keys resolved to the active locale (no hardcoded
 * strings). Consumed by the RHF `zodResolver` in each auth form.
 */

type T = (key: string) => string;

const MIN_PASSWORD = 8;

const emailField = (t: T) =>
  z
    .string()
    .trim()
    .min(1, { message: t("emailRequired") })
    .email({ message: t("emailInvalid") });

const passwordPolicy = (t: T) =>
  z.string().min(MIN_PASSWORD, { message: t("passwordTooShort") });

export function loginSchema(t: T) {
  return z.object({
    email: emailField(t),
    password: z.string().min(1, { message: t("passwordRequired") }),
  });
}
export type LoginValues = z.infer<ReturnType<typeof loginSchema>>;

export function forgotPasswordSchema(t: T) {
  return z.object({
    email: emailField(t),
  });
}
export type ForgotPasswordValues = z.infer<ReturnType<typeof forgotPasswordSchema>>;

export function resetPasswordSchema(t: T) {
  return z
    .object({
      password: passwordPolicy(t),
      confirmPassword: z.string().min(1, { message: t("confirmRequired") }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("passwordsMustMatch"),
      path: ["confirmPassword"],
    });
}
export type ResetPasswordValues = z.infer<ReturnType<typeof resetPasswordSchema>>;

export function acceptInviteSchema(t: T) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(2, { message: t("nameRequired") }),
      password: passwordPolicy(t),
      confirmPassword: z.string().min(1, { message: t("confirmRequired") }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("passwordsMustMatch"),
      path: ["confirmPassword"],
    });
}
export type AcceptInviteValues = z.infer<ReturnType<typeof acceptInviteSchema>>;
