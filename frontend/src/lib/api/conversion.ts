/**
 * Won → project conversion client (#31) — orchestrates the existing feature
 * APIs (opportunities, proposals, CRM, templates, projects, finance) into the
 * single zero-re-entry flow (BR-035). No new store: it reuses each feature's
 * mock so the conversion stays consistent with everything else in the session.
 *
 * The backend does not exist yet; swapping this module for real HTTP calls
 * must not change the shapes in `conversion-types.ts`.
 */

import type { Role } from "@/lib/session";
import { opportunitiesApi } from "@/lib/api/opportunities";
import { proposalsApi } from "@/lib/api/proposals";
import { projectsApi } from "@/lib/api/projects";
import { templatesApi } from "@/lib/api/templates";
import { financeApi } from "@/lib/api/finance";
import { canAccessFinance } from "@/lib/api/finance-types";
import { http, HttpError } from "@/lib/api/http";
import type { Contact } from "@/lib/api/crm-types";
import type { Project } from "@/lib/api/projects-types";
import {
  ConversionError,
  type ConversionContext,
  type ConvertWizardInput,
} from "@/lib/api/conversion-types";

/**
 * Backend BR-035 prefill (POST /opportunities/{id}/convert). This endpoint is a
 * read-only assembler despite the POST verb — it returns everything the wizard
 * needs in one call and does NOT create the project (that is POST
 * /projects/from-opportunity, in the projects domain).
 */
interface ConversionPrefill {
  opportunityId: string;
  companyId: string | null;
  companyName: string | null;
  primaryContactId: string | null;
  contacts: Array<{
    id: string;
    name: string;
    roleTitle: string | null;
    email: string | null;
  }>;
  acceptedProposalId: string | null;
  contractedValue: number | null;
  hasAcceptedProposal: boolean;
  verbalClose: boolean;
}

function translateConversionError(err: unknown): ConversionError {
  if (err instanceof ConversionError) return err;
  if (err instanceof HttpError) {
    if (err.status === 404) return new ConversionError("not_found");
    if (err.status === 403) return new ConversionError("forbidden");
  }
  return new ConversionError("network");
}

export interface ConversionCaller {
  role: Role;
  userId: string;
  paymentsGrant: boolean;
}

export const conversionRoutes = {
  wizard: (opportunityId: string) => `/crm/opportunities/${opportunityId}/convert`,
} as const;

export interface ConversionApi {
  getContext(opportunityId: string, caller: ConversionCaller): Promise<ConversionContext>;
  convert(input: ConvertWizardInput, caller: ConversionCaller): Promise<Project>;
}

export const conversionApi: ConversionApi = {
  // WIRED → GET /opportunities/{id} + POST /opportunities/{id}/convert (prefill)
  // + GET /proposals/{acceptedId}. Templates come from the (still-mock) templates
  // client, wired by its own owner.
  async getContext(opportunityId, caller) {
    const { role, userId, paymentsGrant } = caller;
    const canFinance = canAccessFinance(role, paymentsGrant);

    try {
      // Opportunity — throws not_found for a hidden/unknown deal (BR-002).
      const opportunity = await opportunitiesApi.getOpportunity(
        opportunityId,
        role,
        userId,
        paymentsGrant
      );

      // Entry guards: only a won, not-yet-converted deal can be converted (BR-036).
      // NOTE: `converted` is an INTEGRATION-GAP (backend does not expose it), so
      // the already_converted guard is effectively inert until that lands.
      if (opportunity.outcome !== "won") throw new ConversionError("not_won");
      if (opportunity.converted) {
        throw new ConversionError("already_converted", opportunity.projectId);
      }

      // BR-035 prefill (company + contacts + accepted proposal + value) in one
      // authoritative call, plus the templates to instantiate from.
      const [prefill, templates] = await Promise.all([
        http.post<ConversionPrefill>(`/opportunities/${opportunityId}/convert`),
        templatesApi.list(),
      ]);
      const activeTemplates = templates.filter((t) => t.active);

      const acceptedProposal = prefill.acceptedProposalId
        ? await proposalsApi.getProposal(
            prefill.acceptedProposalId,
            role,
            userId,
            paymentsGrant
          )
        : null;

      const contacts: Contact[] = prefill.contacts.map((c) => ({
        id: c.id,
        name: c.name,
        photoUrl: null,
        role: c.roleTitle,
        email: c.email,
        phone: null,
        website: null,
        companyId: prefill.companyId ?? "",
        companyName: prefill.companyName ?? "",
        // INTEGRATION-GAP: ownerId/ownerName — not carried in the conversion prefill
        ownerId: "",
        ownerName: "",
        notes: null,
        lastInteractionAt: null,
        nextAction: null,
        nextActionAt: null,
        status: "active",
        archivedAt: null,
      }));

      const suggestedValueCents =
        (canFinance ? prefill.contractedValue : null) ??
        opportunity.valueCents ??
        null;

      return {
        opportunity,
        company: {
          id: prefill.companyId ?? opportunity.companyId,
          name: prefill.companyName ?? "",
          // INTEGRATION-GAP: clienteAtivo — the prefill does not expose the
          // backend is_active_client flag; never derived client-side (issue #57).
          clienteAtivo: false,
        },
        contacts,
        acceptedProposal,
        templates: activeTemplates,
        suggestedValueCents,
        canFinance,
      };
    } catch (err) {
      throw translateConversionError(err);
    }
  },

  // ORCHESTRATION (cross-domain): project creation delegates to `projectsApi`
  // (whose real path is POST /projects/from-opportunity), milestone seeding to
  // `financeApi`, and the source link to `opportunitiesApi.markConverted`. Those
  // feature clients are wired by their own owners; this file only composes them.
  async convert(input, caller) {
    const { role, userId, paymentsGrant } = caller;
    const canFinance = canAccessFinance(role, paymentsGrant);

    // 1) Create the project from the template (phases + team + links, BR-035/036).
    const project = await projectsApi.convertOpportunity(
      {
        name: input.name,
        clientId: input.clientId,
        clientName: input.clientName,
        managerId: input.managerId,
        description: input.description,
        startDate: input.startDate,
        dueDate: input.dueDate,
        hoursBudget: input.hoursBudget,
        contractedValueCents: input.contractedValueCents,
        teamMemberIds: input.teamMemberIds,
        phases: input.phases,
        opportunityId: input.opportunityId,
        proposalId: input.proposalId,
        paymentMilestonesConfirmed: input.paymentMilestonesConfirmed,
      },
      userId,
      canFinance
    );

    // 2) Seed the confirmed payment milestones (BR-037) — finance only. They land
    //    in the shared finance store so the project's Financeiro tab shows them
    //    with no re-entry.
    if (canFinance && input.paymentMilestonesConfirmed) {
      for (const m of input.milestones) {
        await financeApi.createMilestone(
          {
            projectId: project.id,
            description: m.description,
            amountCents: m.amountCents,
            expectedDate: m.expectedDate,
            completionCriteria: m.completionCriteria,
            externalInvoiceRef: null,
          },
          role,
          paymentsGrant
        );
      }
    }

    // 3) Link the source opportunity to the new project (BR-036).
    await opportunitiesApi.markConverted(input.opportunityId, project.id, userId);

    return project;
  },
};
