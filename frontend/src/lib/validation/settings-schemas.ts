import { z } from "zod";

/**
 * Settings form schemas (F20 / issue #42). Factories receive a `field`
 * translator so all validation messages are i18n keys resolved to the active
 * locale. Consumed by the RHF `zodResolver` in the settings forms.
 */

type T = (key: string) => string;

const optionalEmail = (t: T) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: t("emailInvalid"),
    })
    .optional()
    .or(z.literal(""));

const optionalUrl = (t: T) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^https?:\/\/.+/i.test(v), {
      message: t("urlInvalid"),
    })
    .optional()
    .or(z.literal(""));

export function aureaProfileSchema(t: T) {
  return z.object({
    name: z.string().trim().min(2, { message: t("nameRequired") }),
    tagline: z.string().trim().max(120, { message: t("taglineLong") }).optional().or(z.literal("")),
    email: optionalEmail(t),
    phone: z.string().trim().optional().or(z.literal("")),
    website: optionalUrl(t),
    addressLine: z.string().trim().optional().or(z.literal("")),
    city: z.string().trim().optional().or(z.literal("")),
    postalCode: z.string().trim().optional().or(z.literal("")),
    country: z.string().trim().optional().or(z.literal("")),
  });
}

export type AureaProfileFormValues = z.infer<ReturnType<typeof aureaProfileSchema>>;
