import { z } from "zod";
import {
  TEMPLATE_TASK_ROLES,
  TEMPLATE_TYPES,
  type TemplateTaskRole,
  type TemplateType,
} from "@/lib/api/template-types";

/**
 * Template form schemas (F9). Factories receive a `field` translator so all
 * validation messages are i18n keys resolved to the active locale (no hardcoded
 * strings). Consumed by the RHF `zodResolver` in the template dialogs.
 */

type T = (key: string) => string;

/** A non-negative integer entered as a string ("30"). Empty → invalid. */
const positiveIntField = (t: T) =>
  z
    .string()
    .trim()
    .min(1, { message: t("required") })
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 0, { message: t("invalidNumber") });

const hoursField = (t: T) =>
  z
    .string()
    .trim()
    .min(1, { message: t("required") })
    .refine((v) => {
      const n = Number(v.replace(",", "."));
      return Number.isFinite(n) && n > 0;
    }, { message: t("invalidHours") });

export function templateSchema(t: T) {
  return z.object({
    name: z.string().trim().min(3, { message: t("nameRequired") }),
    type: z.enum(TEMPLATE_TYPES as [TemplateType, ...TemplateType[]]),
    description: z.string().trim().min(5, { message: t("descriptionRequired") }),
    expectedDurationDays: positiveIntField(t),
    active: z.boolean(),
  });
}
export type TemplateFormValues = z.infer<ReturnType<typeof templateSchema>>;

export function phaseSchema(t: T) {
  return z
    .object({
      name: z.string().trim().min(2, { message: t("phaseNameRequired") }),
      expectedDurationDays: positiveIntField(t),
      isMilestone: z.boolean(),
      milestoneName: z.string().trim().optional().or(z.literal("")),
    })
    .refine(
      (v) => !v.isMilestone || (v.milestoneName != null && v.milestoneName.trim().length >= 2),
      { message: t("milestoneNameRequired"), path: ["milestoneName"] },
    );
}
export type PhaseFormValues = z.infer<ReturnType<typeof phaseSchema>>;

export function taskSchema(t: T) {
  return z.object({
    title: z.string().trim().min(2, { message: t("taskTitleRequired") }),
    roleResponsible: z.enum(TEMPLATE_TASK_ROLES as [TemplateTaskRole, ...TemplateTaskRole[]]),
    estimateHours: hoursField(t),
  });
}
export type TaskFormValues = z.infer<ReturnType<typeof taskSchema>>;

/** Parse a locale-friendly hours string ("6" or "1,5") to a number. */
export function parseHours(value: string): number {
  return Number(value.trim().replace(",", "."));
}
