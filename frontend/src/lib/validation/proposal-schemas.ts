import { z } from "zod";

/**
 * Proposal form schemas (F6). Factories receive a `field` translator so all
 * validation messages are i18n keys resolved to the active locale (no hardcoded
 * strings). Consumed by the RHF `zodResolver` in the proposal dialogs.
 */

type T = (key: string) => string;

const euroValue = (t: T) =>
  z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^\d+([.,]\d{1,2})?$/.test(v), {
      message: t("valueInvalid"),
    });

/** Quick-create — only the linked opportunity is strictly required up front. */
export function createProposalSchema(t: T) {
  return z.object({
    opportunityId: z.string().trim().min(1, { message: t("opportunityRequired") }),
    contactId: z.string().optional().or(z.literal("")),
    value: euroValue(t),
    validUntil: z.string().optional().or(z.literal("")),
    notes: z.string().trim().optional().or(z.literal("")),
  });
}
export type CreateProposalFormValues = z.infer<ReturnType<typeof createProposalSchema>>;

/** Mark rejected — a rejection note is mandatory (§1.2). */
export function rejectProposalSchema(t: T) {
  return z.object({
    note: z.string().trim().min(3, { message: t("rejectNoteRequired") }),
  });
}
export type RejectProposalFormValues = z.infer<ReturnType<typeof rejectProposalSchema>>;

/** Reissue an expired proposal — a new validity date is mandatory (§1.2). */
export function resendProposalSchema(t: T) {
  return z.object({
    validUntil: z.string().trim().min(1, { message: t("validityRequired") }),
  });
}
export type ResendProposalFormValues = z.infer<ReturnType<typeof resendProposalSchema>>;
