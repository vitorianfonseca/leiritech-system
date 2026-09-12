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
/**
 * Parse a user-entered euro amount into integer cents.
 *
 * This has to survive both the pt-PT convention the UI presents ("1.500,00")
 * and the plain decimal a browser, a paste or our own prefill can produce
 * ("1500.00"). The previous implementation stripped every "." as a thousands
 * separator, so the value `centsToEurosInput` emitted did not survive a round
 * trip: prefilling a €1500 payment and submitting it recorded €150 000. The
 * two functions in this file are inverses and must compose.
 *
 * Disambiguation, in order:
 *  - both separators present -> the RIGHTMOST is the decimal one;
 *  - one separator, exactly three digits after it -> thousands ("1.500");
 *  - one separator, one or two digits after it -> decimal ("1500,5");
 *  - repeated separators -> thousands ("1.500.000").
 *
 * Money never carries three decimals, which is what makes the three-digit
 * rule safe here.
 */
export function eurosToCents(value: string): number {
  const raw = value.trim().replace(/[\s\u00A0€]/g, "");
  if (!raw) return NaN;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    normalized = raw.split(thousandsSep).join("").replace(decimalSep, ".");
  } else {
    const sep = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
    if (sep === null) {
      normalized = raw;
    } else {
      const occurrences = raw.split(sep).length - 1;
      const decimals = raw.length - raw.lastIndexOf(sep) - 1;
      // Repeated, or a clean group of three -> a thousands separator.
      normalized =
        occurrences > 1 || decimals === 3
          ? raw.split(sep).join("")
          : raw.split(sep).join(".");
    }
  }

  if (!/^-?\d*\.?\d*$/.test(normalized) || normalized === "" || normalized === ".") {
    return NaN;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

/**
 * Format cents back into an edit string in the locale the field presents
 * ("1500,50"). Kept as the exact inverse of `eurosToCents`.
 */
export function centsToEurosInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
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
