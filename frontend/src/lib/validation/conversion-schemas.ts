import { z } from "zod";

/**
 * Won → project conversion schemas (#31). Factories take a `field` translator so
 * every message is an i18n key resolved to the active locale (no hardcoded
 * strings). The euro regex matches the projects/finance forms (pt-PT: "1.234,56").
 */

type T = (key: string) => string;

const EURO_RE = /^\d{1,3}(\.?\d{3})*([.,]\d{1,2})?$/;

/**
 * Step 1 — details. `requireValue` is true when the contracted value must be
 * entered by hand (verbal close with no accepted proposal, finance user).
 */
export function convertDetailsSchema(t: T, requireValue: boolean) {
  return z.object({
    name: z.string().trim().min(2, { message: t("nameRequired") }),
    startDate: z.string().trim().min(1, { message: t("startRequired") }),
    contractedValue: requireValue
      ? z
          .string()
          .trim()
          .min(1, { message: t("valueRequired") })
          .refine((v) => EURO_RE.test(v.replace(/\s/g, "")), { message: t("valueInvalid") })
      : z
          .string()
          .trim()
          .optional()
          .or(z.literal(""))
          .refine((v) => !v || EURO_RE.test(v.replace(/\s/g, "")), { message: t("valueInvalid") }),
  });
}
export type ConvertDetailsValues = z.infer<ReturnType<typeof convertDetailsSchema>>;

/** A single payment-milestone row (BR-071 requires acceptance criteria). */
export function milestoneRowSchema(t: T) {
  return z.object({
    description: z.string().trim().min(2, { message: t("milestoneDescriptionRequired") }),
    amountCents: z.number().int().nonnegative(),
    expectedDate: z.string().trim().min(1, { message: t("milestoneDateRequired") }),
    completionCriteria: z.string().trim().min(3, { message: t("milestoneCriteriaRequired") }),
  });
}
