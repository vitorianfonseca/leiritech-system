import { z } from "zod";
import { PIPELINE_STAGE_IDS, LOST_REASONS } from "@/lib/api/opportunities-types";

/**
 * Pipeline form schemas (F5). Factories receive a `field` translator so all
 * validation messages are i18n keys resolved to the active locale (no hardcoded
 * strings). Consumed by the RHF `zodResolver` in the pipeline dialogs.
 */

type T = (key: string) => string;

const stageEnum = z.enum(
  PIPELINE_STAGE_IDS as [string, ...string[]]
);
const reasonEnum = z.enum(LOST_REASONS as [string, ...string[]]);

/** Move to another stage — próxima ação is mandatory (BR-010). */
export function moveSchema(t: T) {
  return z.object({
    toStageId: stageEnum,
    nextAction: z.string().trim().min(3, { message: t("nextActionRequired") }),
    nextActionAt: z.string().optional().or(z.literal("")),
  });
}
export type MoveFormValues = z.infer<ReturnType<typeof moveSchema>>;

/** Mark lost — reason is mandatory (BR-011). */
export function loseSchema(t: T) {
  return z.object({
    reason: reasonEnum.refine((v) => LOST_REASONS.includes(v as never), {
      message: t("lostReasonRequired"),
    }),
    note: z.string().trim().optional().or(z.literal("")),
  });
}
export type LoseFormValues = z.infer<ReturnType<typeof loseSchema>>;

/** Reopen a lost opportunity — target stage + a re-open note. */
export function reopenSchema(t: T) {
  return z.object({
    toStageId: stageEnum,
    note: z.string().trim().min(3, { message: t("reopenNoteRequired") }),
  });
}
export type ReopenFormValues = z.infer<ReturnType<typeof reopenSchema>>;

/** Quick-create form (PRD §31) — próxima ação required from the start (BR-010). */
export function createOpportunitySchema(t: T) {
  return z.object({
    title: z.string().trim().min(3, { message: t("titleRequired") }),
    companyId: z.string().trim().min(1, { message: t("companyRequired") }),
    ownerId: z.string().trim().min(1, { message: t("ownerRequired") }),
    stageId: stageEnum,
    value: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine((v) => !v || /^\d+([.,]\d{1,2})?$/.test(v), {
        message: t("valueInvalid"),
      }),
    nextAction: z.string().trim().min(3, { message: t("nextActionRequired") }),
    nextActionAt: z.string().optional().or(z.literal("")),
  });
}
export type CreateOpportunityFormValues = z.infer<
  ReturnType<typeof createOpportunitySchema>
>;
