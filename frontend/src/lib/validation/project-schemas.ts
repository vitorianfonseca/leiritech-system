import { z } from "zod";
import { parseEuroToCents } from "@/lib/currency";

/**
 * Project form schemas (F8). Factories receive a `field` translator so all
 * validation messages are i18n keys resolved to the active locale (no hardcoded
 * strings). Consumed by the RHF `zodResolver` in the project dialogs/forms.
 */

type T = (key: string) => string;

const euroValue = (t: T) =>
  z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || parseEuroToCents(v) !== null, {
      // Delegates to the SAME parser `submit()` calls (H7, AUDIT_REPORT.md) so
      // "passes validation" and "parses to a real amount" can never drift —
      // a value that fails here is rejected with a visible error instead of
      // silently becoming €0.00.
      message: t("valueInvalid"),
    });

const hours = (t: T) =>
  z
    .string()
    .trim()
    .min(1, { message: t("hoursRequired") })
    .refine((v) => /^\d+$/.test(v) && Number(v) > 0, { message: t("hoursInvalid") });

/** Quick-create a project. */
export function createProjectSchema(t: T) {
  return z
    .object({
      name: z.string().trim().min(2, { message: t("nameRequired") }),
      clientId: z.string().trim().min(1, { message: t("clientRequired") }),
      managerId: z.string().trim().min(1, { message: t("managerRequired") }),
      description: z.string().trim().optional().or(z.literal("")),
      startDate: z.string().trim().min(1, { message: t("startRequired") }),
      dueDate: z.string().trim().min(1, { message: t("dueRequired") }),
      hoursBudget: hours(t),
      value: euroValue(t),
    })
    .refine((v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate, {
      message: t("dueBeforeStart"),
      path: ["dueDate"],
    });
}
export type CreateProjectFormValues = z.infer<ReturnType<typeof createProjectSchema>>;

/** Add / edit a phase. */
export function phaseSchema(t: T) {
  return z.object({
    name: z.string().trim().min(2, { message: t("phaseNameRequired") }),
    dueDate: z.string().optional().or(z.literal("")),
  });
}
export type PhaseFormValues = z.infer<ReturnType<typeof phaseSchema>>;

/** Publish / override health — the reason is required only when overriding (BR-031). */
export function healthOverrideSchema(t: T, reasonRequired: boolean) {
  return z.object({
    reason: reasonRequired
      ? z.string().trim().min(5, { message: t("reasonRequired") })
      : z.string().trim().optional().or(z.literal("")),
  });
}
export type HealthOverrideFormValues = z.infer<ReturnType<typeof healthOverrideSchema>>;

/** Capture a mandatory reason (pause / cancel / block phase). */
export function reasonSchema(t: T) {
  return z.object({
    reason: z.string().trim().min(5, { message: t("reasonRequired") }),
  });
}
export type ReasonFormValues = z.infer<ReturnType<typeof reasonSchema>>;
