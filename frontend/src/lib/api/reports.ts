/**
 * Reports data client (F19). Aggregates the EXISTING mock stores into the
 * scoped dataset the /reports surface renders — it invents no data of its own.
 *
 * Each source list method already applies role scoping (`visibleTo`) and
 * financial gating (BR-002 / BR-008); this client only decides WHICH sources a
 * caller may read at all (Comercial → pipeline access; Financeiro → finance
 * access) and assembles the filter-option lists.
 */

import type {
  ReportContext,
  ReportDataset,
  ReportsApi,
  FilterOption,
} from "@/lib/api/reports-types";
import { ReportError } from "@/lib/api/reports-types";
import { opportunitiesApi } from "@/lib/api/opportunities";
import { canAccessPipeline } from "@/lib/api/opportunities-types";
import { crmApi } from "@/lib/api/crm";
import { projectsApi } from "@/lib/api/projects";
import { PROJECT_STATES } from "@/lib/api/projects-types";
import { tasksApi } from "@/lib/api/tasks";
import { timeApi } from "@/lib/api/time";
import { teamApi } from "@/lib/api/team";
import { financeApi } from "@/lib/api/finance";
import { canAccessFinance } from "@/lib/api/finance-types";

function optionsFrom(pairs: Array<[string, string]>): FilterOption[] {
  const map = new Map<string, string>();
  for (const [id, name] of pairs) {
    if (id && name && !map.has(id)) map.set(id, name);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
}

export const reportsApi: ReportsApi = {
  async getDataset(ctx: ReportContext): Promise<ReportDataset> {
    const { role, userId, paymentsGrant } = ctx;
    const canComercial = canAccessPipeline(role);
    const canFinance = canAccessFinance(role, paymentsGrant);
    const scope: ReportDataset["scope"] = role === "membro" ? "own" : "full";
    const timeScope = role === "membro" ? "own" : "team";

    try {
      const [
        opportunities,
        stages,
        companies,
        projects,
        tasks,
        timeResult,
        workload,
        finance,
      ] = await Promise.all([
        canComercial
          ? opportunitiesApi.listOpportunities(role, userId, paymentsGrant)
          : Promise.resolve([]),
        opportunitiesApi.getPipelineStages(),
        canComercial
          ? crmApi.listCompanies({ role, userId, paymentsGrant })
          : Promise.resolve([]),
        projectsApi.listProjects(role, userId, paymentsGrant),
        tasksApi.listTasks(role, userId),
        timeApi.listEntries(role, userId, timeScope),
        teamApi.getTeamWorkload(role, userId, 0),
        canFinance
          ? financeApi.getOverview(role, paymentsGrant)
          : Promise.resolve(null),
      ]);

      const timeEntries = timeResult.entries;
      const team = workload.members;

      const clients = optionsFrom([
        ...companies.map((c) => [c.id, c.name] as [string, string]),
        ...projects.map((p) => [p.clientId, p.clientName] as [string, string]),
      ]);
      const projectOptions = optionsFrom(
        projects.map((p) => [p.id, p.name] as [string, string])
      );
      const members = optionsFrom([
        ...team.map((m) => [m.userId, m.name] as [string, string]),
        ...opportunities.map((o) => [o.ownerId, o.ownerName] as [string, string]),
        ...projects.map((p) => [p.managerId, p.managerName] as [string, string]),
        ...timeEntries.map((e) => [e.userId, e.userName] as [string, string]),
      ]);

      return {
        scope,
        canComercial,
        canFinance,
        generatedAt: new Date().toISOString(),
        opportunities,
        stages,
        companies,
        projects,
        tasks,
        timeEntries,
        team,
        finance: finance
          ? { milestones: finance.milestones, costs: finance.costs }
          : null,
        filterOptions: {
          clients,
          projects: projectOptions,
          members,
          states: [...PROJECT_STATES],
        },
      };
    } catch (err) {
      if (err instanceof ReportError) throw err;
      throw new ReportError("network", (err as Error)?.message);
    }
  },
};
