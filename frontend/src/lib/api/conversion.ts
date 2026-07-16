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
import { crmApi } from "@/lib/api/crm";
import { opportunitiesApi } from "@/lib/api/opportunities";
import { proposalsApi } from "@/lib/api/proposals";
import { projectsApi } from "@/lib/api/projects";
import { templatesApi } from "@/lib/api/templates";
import { financeApi } from "@/lib/api/finance";
import { canAccessFinance } from "@/lib/api/finance-types";
import type { Project } from "@/lib/api/projects-types";
import {
  ConversionError,
  type ConversionContext,
  type ConvertWizardInput,
} from "@/lib/api/conversion-types";

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
  async getContext(opportunityId, caller) {
    const { role, userId, paymentsGrant } = caller;
    const canFinance = canAccessFinance(role, paymentsGrant);

    // Opportunity — throws not_found for a hidden/unknown deal (BR-002).
    const opportunity = await opportunitiesApi.getOpportunity(
      opportunityId,
      role,
      userId,
      paymentsGrant
    );

    // Entry guards: only a won, not-yet-converted deal can be converted (BR-036).
    if (opportunity.outcome !== "won") throw new ConversionError("not_won");
    if (opportunity.converted) throw new ConversionError("already_converted", opportunity.projectId);

    // Company + contacts (pre-fill), accepted proposal (pre-fill / verbal fallback),
    // and the templates to instantiate from — fetched in parallel.
    const [company, proposals, templates] = await Promise.all([
      crmApi.getCompany(opportunity.companyId, role, userId, paymentsGrant),
      proposalsApi.listProposals({ role, userId, paymentsGrant }),
      templatesApi.list(),
    ]);
    const activeTemplates = templates.filter((t) => t.active);

    const acceptedProposal =
      proposals
        .filter((p) => p.opportunityId === opportunityId && p.state === "accepted")
        .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))[0] ?? null;

    const suggestedValueCents = acceptedProposal?.valueCents ?? opportunity.valueCents ?? null;

    return {
      opportunity,
      company: { id: company.id, name: company.name, clienteAtivo: company.clienteAtivo },
      contacts: company.contacts,
      acceptedProposal,
      templates: activeTemplates,
      suggestedValueCents,
      canFinance,
    };
  },

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
