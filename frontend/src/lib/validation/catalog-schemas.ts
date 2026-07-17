import { z } from "zod";

/**
 * Catalog item form schema. The factory receives a `field` translator so all
 * validation messages are i18n keys resolved to the active locale. `price` is a
 * euro string (parsed to cents on submit); `taxRate` is a percent string.
 */

type T = (key: string) => string;

export function catalogItemSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, { message: t("nameRequired") }),
    description: z.string().trim().optional().or(z.literal("")),
    category: z.string().trim().optional().or(z.literal("")),
    unit: z.enum(["unit", "hour", "day", "month", "m2", "license", "fixed"]),
    price: z
      .string()
      .trim()
      .min(1, { message: t("priceRequired") })
      .refine((v) => /^\d+([.,]\d{1,2})?$/.test(v), { message: t("priceInvalid") }),
    taxRate: z
      .string()
      .trim()
      .refine((v) => !v || /^\d{1,3}([.,]\d{1,2})?$/.test(v), {
        message: t("taxInvalid"),
      })
      .optional()
      .or(z.literal("")),
    billingType: z.enum(["one_time", "monthly", "annual"]),
  });
}

export type CatalogItemFormValues = z.infer<ReturnType<typeof catalogItemSchema>>;
