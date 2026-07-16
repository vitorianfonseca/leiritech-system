import { z } from "zod";

/**
 * CRM form schemas (F4). Factories receive a `field` translator so all
 * validation messages are i18n keys resolved to the active locale (no hardcoded
 * strings). Consumed by the RHF `zodResolver` in the CRM dialogs/forms.
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

export function companySchema(t: T) {
  return z.object({
    name: z.string().trim().min(2, { message: t("nameRequired") }),
    status: z.enum(["potencial", "ativo", "inativo", "parceiro", "arquivada"]),
    sector: z.string().trim().min(2, { message: t("sectorRequired") }),
    ownerId: z.string().trim().min(1, { message: t("ownerRequired") }),
    source: z.enum(["referral", "inbound", "outbound", "event", "partner", "other"]),
    website: optionalUrl(t),
    email: optionalEmail(t),
    phone: z.string().trim().optional().or(z.literal("")),
    address: z.string().trim().optional().or(z.literal("")),
    description: z.string().trim().optional().or(z.literal("")),
    nextAction: z.string().trim().optional().or(z.literal("")),
    nextActionAt: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), {
        message: t("dateInvalid"),
      })
      .optional()
      .or(z.literal("")),
  });
}
export type CompanyFormValues = z.infer<ReturnType<typeof companySchema>>;

export function contactSchema(t: T) {
  return z.object({
    name: z.string().trim().min(2, { message: t("nameRequired") }),
    companyId: z.string().trim().min(1, { message: t("companyRequired") }),
    ownerId: z.string().trim().min(1, { message: t("ownerRequired") }),
    status: z.enum(["active", "inactive"]),
    role: z.string().trim().optional().or(z.literal("")),
    email: optionalEmail(t),
    phone: z.string().trim().optional().or(z.literal("")),
    notes: z.string().trim().optional().or(z.literal("")),
  });
}
export type ContactFormValues = z.infer<ReturnType<typeof contactSchema>>;

export function interactionSchema(t: T) {
  return z.object({
    type: z.enum(["call", "meeting", "email", "message", "note", "follow_up"]),
    subject: z.string().trim().min(2, { message: t("subjectRequired") }),
    occurredAt: z
      .string()
      .trim()
      .min(1, { message: t("dateRequired") })
      .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), { message: t("dateInvalid") }),
    contactId: z.string().trim().optional().or(z.literal("")),
    opportunityId: z.string().trim().optional().or(z.literal("")),
    projectId: z.string().trim().optional().or(z.literal("")),
    body: z.string().trim().optional().or(z.literal("")),
  });
}
export type InteractionFormValues = z.infer<ReturnType<typeof interactionSchema>>;
