import { z } from "zod";

/**
 * Finance form schemas (F14). Factories receive a `field` translator so all
 * validation messages are i18n keys resolved to the active locale (no hardcoded
 * strings). Consumed by the RHF `zodResolver` in the finance dialogs.
 *
 * Money is entered in EUR (as a string, e.g. "3500" or "3500,50") and converted
 * to integer cents via `eurosToCents`. Terminology stays non-fiscal
 * (BR-070/072): `externalInvoiceRef` is a plain reference string.
 */

type T = (key: string) => string;

/** Parse a locale-friendly euros string ("1.234,56" or "1234.56") to cents. */
export function eurosToCents(value: string): number {
  const normalized = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

/** Format cents back into a plain edit string ("3500.50") for form defaults. */
export function centsToEurosInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

const amountField = (t: T) =>
  z
    .string()
    .trim()
    .min(1, { message: t("amountRequired") })
    .refine((v) => {
      const c = eurosToCents(v);
      return Number.isFinite(c) && c > 0;
    }, { message: t("amountInvalid") });

const dateField = (t: T) =>
  z
    .string()
    .trim()
    .min(1, { message: t("dateRequired") })
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), { message: t("dateInvalid") });

export function milestoneSchema(t: T) {
  return z.object({
    projectId: z.string().min(1, { message: t("projectRequired") }),
    description: z
      .string()
      .trim()
      .min(3, { message: t("descriptionRequired") }),
    amount: amountField(t),
    expectedDate: dateField(t),
    // BR-071: completion criteria are mandatory for every milestone.
    completionCriteria: z
      .string()
      .trim()
      .min(5, { message: t("completionCriteriaRequired") }),
    externalInvoiceRef: z.string().trim().optional().or(z.literal("")),
  });
}
export type MilestoneFormValues = z.infer<ReturnType<typeof milestoneSchema>>;

/** `maxCents` caps the payment at the remaining amount for the milestone. */
export function recordPaymentSchema(t: T, maxCents: number) {
  return z.object({
    amount: amountField(t).refine((v) => eurosToCents(v) <= maxCents, {
      message: t("amountExceedsRemaining"),
    }),
    paidDate: dateField(t),
    externalInvoiceRef: z.string().trim().optional().or(z.literal("")),
  });
}
export type RecordPaymentFormValues = z.infer<ReturnType<typeof recordPaymentSchema>>;

export function projectCostSchema(t: T) {
  return z.object({
    projectId: z.string().min(1, { message: t("projectRequired") }),
    description: z
      .string()
      .trim()
      .min(3, { message: t("descriptionRequired") }),
    category: z.enum([
      "subcontracting",
      "software",
      "hardware",
      "travel",
      "other",
    ]),
    amount: amountField(t),
    incurredDate: dateField(t),
  });
}
export type ProjectCostFormValues = z.infer<ReturnType<typeof projectCostSchema>>;
