/**
 * Proposal-template API client — WIRED to `/proposal-templates`. Sections/items
 * are replace-on-save. Distinct from the PROJECT templates client (`templates.ts`).
 */

import { http } from "./http";
import type { Page } from "./catalog-types";
import type {
  ProposalTemplate,
  ProposalTemplateInput,
} from "./proposal-templates-types";

export const proposalTemplatesApi = {
  async list(params: { q?: string; includeArchived?: boolean } = {}): Promise<Page<ProposalTemplate>> {
    return http.get<Page<ProposalTemplate>>("/proposal-templates", {
      query: { q: params.q, include_archived: params.includeArchived, page_size: 100 },
    });
  },

  async get(id: string): Promise<ProposalTemplate> {
    return http.get<ProposalTemplate>(`/proposal-templates/${id}`);
  },

  async create(input: ProposalTemplateInput): Promise<ProposalTemplate> {
    return http.post<ProposalTemplate>("/proposal-templates", input);
  },

  async update(id: string, input: Partial<ProposalTemplateInput>): Promise<ProposalTemplate> {
    return http.patch<ProposalTemplate>(`/proposal-templates/${id}`, input);
  },

  async archive(id: string): Promise<ProposalTemplate> {
    return http.post<ProposalTemplate>(`/proposal-templates/${id}/archive`, {});
  },

  async restore(id: string): Promise<ProposalTemplate> {
    return http.post<ProposalTemplate>(`/proposal-templates/${id}/restore`, {});
  },
};
