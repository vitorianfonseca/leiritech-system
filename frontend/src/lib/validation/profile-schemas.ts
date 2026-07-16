import { z } from "zod";

/**
 * Personal profile form schemas (§8 /profile). Factories receive a `field`
 * translator so all messages are i18n keys resolved to the active locale.
 * Consumed by the RHF `zodResolver` in the profile forms.
 */

type T = (key: string) => string;

const MIN_PASSWORD = 8;

export function personalProfileSchema(t: T) {
  return z.object({
    name: z.string().trim().min(2, { message: t("nameRequired") }),
    email: z
      .string()
      .trim()
      .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
        message: t("emailInvalid"),
      }),
    phone: z.string().trim().optional().or(z.literal("")),
  });
}

export type PersonalProfileFormValues = z.infer<
  ReturnType<typeof personalProfileSchema>
>;

export function changePasswordSchema(t: T) {
  return z
    .object({
      currentPassword: z.string().min(1, { message: t("currentPasswordRequired") }),
      newPassword: z.string().min(MIN_PASSWORD, { message: t("passwordTooShort") }),
      confirmPassword: z.string().min(1, { message: t("confirmPasswordRequired") }),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t("passwordsMustMatch"),
      path: ["confirmPassword"],
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
      message: t("passwordSameAsCurrent"),
      path: ["newPassword"],
    });
}

export type ChangePasswordFormValues = z.infer<
  ReturnType<typeof changePasswordSchema>
>;
