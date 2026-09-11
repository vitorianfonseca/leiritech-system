/**
 * Finance API client — REAL implementation (F14, GATED).
 *
 * Wires `financeApi` to the FastAPI finance surface under `/finance/*`. The
 * shared `http` client (see `./http`) attaches the JWT, refreshes on 401 and
 * deep-maps snake_case↔camelCase, so everything below is camelCase.
 *
 * ⚠️ Access boundary (BR-008/066): the backend is authoritative (every route is
 * gated by `RequireFinance`). We ALSO keep the client-side `assertAccess` guard
 * so the UI never even attempts a call it may not make — mirroring the mock's
 * documented semantics. The `role`/`paymentsGrant` params are preserved on every
 * signature; the backend re-checks server-side.
 *
 * Margin is LIVE (BR-065): the summary is recomputed by the backend per project;
 * `getOverview` aggregates the per-project summaries into the global rollup.
 */

import { http, HttpError } from "./http";
import type { Role } from "@/lib/session";
import {
  canAccessFinance,
  FinanceError,
  type FinanceOverview,
  type FinancialProjectSummary,
  type FinancialSummary,
  type MilestoneInput,
  type PaymentMilestone,
  type PaymentMilestoneStatus,
  type ProjectCost,
  type ProjectCostCategory,
  type ProjectCostInput,
  type RecordPaymentInput,
} from "./finance-types";

/* ------------------------------------------------------------------ *
 * Backend wire shapes (camelCased by the http client)
 * ------------------------------------------------------------------ */

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface MilestoneWire {
  id: string;
  projectId: string;
  companyId: string | null;
  description: string | null;
  amount: number;
  expectedDate: string | null;
  invoicedDate: string | null;
  paidDate: string | null;
  receivedAmount: number;
  completionCriteria: string | null;
  confirmerId: string | null;
  externalInvoiceRef: string | null;
  reference: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface CostWire {
  id: string;
  projectId: string;
  description: string;
  amount: number;
  date: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SummaryWire {
  projectId: string;
  contracted: number;
  received: number;
  pending: number;
  internalCostRate: number;
  loggedHours: number;
  laborCost: number;
  costsTotal: number;
  margin: number;
  milestoneCount: number;
}

interface ProjectWire {
  id: string;
  name: string;
  companyId: string | null;
}

interface CompanyWire {
  id: string;
  name: string;
}

type NameMaps = {
  projects: Map<string, string>;
  companies: Map<string, string>;
};

/* ------------------------------------------------------------------ *
 * Error mapping (BR: preserve the mock's typed error semantics)
 * ------------------------------------------------------------------ */

function toFinanceError(err: unknown): FinanceError {
  if (err instanceof FinanceError) return err;
  if (err instanceof HttpError) {
    if (err.status === 401 || err.status === 403) {
      return new FinanceError("forbidden", err.message);
    }
    return new FinanceError("network", err.message);
  }
  return new FinanceError("network", (err as Error)?.message);
}

/* ------------------------------------------------------------------ *
 * Mapping wire → domain
 * ------------------------------------------------------------------ */

function mapMilestone(m: MilestoneWire, names?: NameMaps): PaymentMilestone {
  return {
    id: m.id,
    projectId: m.projectId,
    // INTEGRATION-GAP: projectName — not on the milestone payload; enriched from
    // the /projects list in getOverview, "" elsewhere.
    projectName: names?.projects.get(m.projectId) ?? "",
    // INTEGRATION-GAP: clientName — resolved from companyId via /companies in
    // getOverview, "" elsewhere.
    clientName: (m.companyId ? names?.companies.get(m.companyId) : "") ?? "",
    description: m.description ?? "",
    amountCents: m.amount,
    // INTEGRATION-GAP: expectedDate — backend allows null; UI expects a date.
    expectedDate: m.expectedDate ?? "",
    invoicedDate: m.invoicedDate,
    paidDate: m.paidDate,
    receivedAmountCents: m.receivedAmount,
    completionCriteria: m.completionCriteria ?? "",
    // Prefer the neutral fiscal note; fall back to the generic reference code.
    externalInvoiceRef: m.externalInvoiceRef ?? m.reference ?? null,
    status: m.status as PaymentMilestoneStatus,
  };
}

function mapCost(c: CostWire, names?: NameMaps): ProjectCost {
  return {
    id: c.id,
    projectId: c.projectId,
    // INTEGRATION-GAP: projectName — enriched from /projects in getOverview.
    projectName: names?.projects.get(c.projectId) ?? "",
    description: c.description,
    // INTEGRATION-GAP: category — backend project_costs has no category column;
    // defaulted to "other".
    category: "other" as ProjectCostCategory,
    amountCents: c.amount,
    // INTEGRATION-GAP: incurredDate — backend allows null date.
    incurredDate: c.date ?? "",
  };
}

function aggregateSummary(summaries: SummaryWire[]): FinancialSummary {
  const contractedCents = summaries.reduce((s, x) => s + x.contracted, 0);
  const receivedCents = summaries.reduce((s, x) => s + x.received, 0);
  const pendingCents = summaries.reduce((s, x) => s + x.pending, 0);
  const costsCents = summaries.reduce((s, x) => s + x.costsTotal, 0);
  const timeCostCents = summaries.reduce((s, x) => s + x.laborCost, 0);
  const marginCents = summaries.reduce((s, x) => s + x.margin, 0);
  return {
    contractedCents,
    receivedCents,
    pendingCents,
    costsCents,
    timeCostCents,
    marginCents,
    marginRatio: contractedCents > 0 ? marginCents / contractedCents : 0,
  };
}

/** One bounded /projects + /companies read to resolve display names. */
async function loadNameMaps(): Promise<NameMaps> {
  const [projects, companies] = await Promise.all([
    http.get<Page<ProjectWire>>("/projects", { query: { page_size: 100 } }),
    http.get<Page<CompanyWire>>("/companies", { query: { page_size: 100 } }),
  ]);
  return {
    projects: new Map(projects.items.map((p) => [p.id, p.name])),
    companies: new Map(companies.items.map((c) => [c.id, c.name])),
  };
}

/* ------------------------------------------------------------------ *
 * Access guard (client-side UX only; backend is authoritative)
 * ------------------------------------------------------------------ */

function assertAccess(role: Role, paymentsGrant: boolean): void {
  if (!canAccessFinance(role, paymentsGrant)) {
    throw new FinanceError("forbidden", "Financial data is not available for this user.");
  }
}

/* ------------------------------------------------------------------ *
 * Public interface (signatures preserved verbatim)
 * ------------------------------------------------------------------ */

export interface FinanceApi {
  /** Full finance overview. Refuses membro and gestor-without-grant (BR-008/066). */
  getOverview(role: Role, paymentsGrant: boolean): Promise<FinanceOverview>;
  createMilestone(
    input: MilestoneInput,
    role: Role,
    paymentsGrant: boolean
  ): Promise<PaymentMilestone>;
  updateMilestone(
    id: string,
    input: MilestoneInput,
    role: Role,
    paymentsGrant: boolean
  ): Promise<PaymentMilestone>;
  recordPayment(
    id: string,
    input: RecordPaymentInput,
    role: Role,
    paymentsGrant: boolean
  ): Promise<PaymentMilestone>;
  /** Restore a milestone to a prior snapshot (powers undo). */
  restoreMilestone(
    prev: PaymentMilestone,
    role: Role,
    paymentsGrant: boolean
  ): Promise<PaymentMilestone>;
  cancelMilestone(
    id: string,
    role: Role,
    paymentsGrant: boolean
  ): Promise<PaymentMilestone>;
  createCost(
    input: ProjectCostInput,
    role: Role,
    paymentsGrant: boolean
  ): Promise<ProjectCost>;
  deleteCost(id: string, role: Role, paymentsGrant: boolean): Promise<void>;
  /** Re-insert a removed cost (powers undo). */
  restoreCost(cost: ProjectCost, role: Role, paymentsGrant: boolean): Promise<void>;
}

const MILESTONES_PATH = "/finance/payment-milestones";
const COSTS_PATH = "/finance/project-costs";

export const financeApi: FinanceApi = {
  async getOverview(role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    try {
      // 1. All milestones (single paged read).
      const page = await http.get<Page<MilestoneWire>>(MILESTONES_PATH, {
        query: { page_size: 100 },
      });
      const rawMilestones = page.items;

      // 2. Display-name maps (2 bounded list reads).
      const names = await loadNameMaps();
      const milestones = rawMilestones.map((m) => mapMilestone(m, names));

      // 3. Per-project costs + live summary. The backend exposes NO global costs
      //    or global summary endpoint, so this fans out per distinct project.
      //    MULTI-CALL: N distinct projects → 2N reads. Bounded by active projects.
      const projectIds = [...new Set(rawMilestones.map((m) => m.projectId))];
      const perProject = await Promise.all(
        projectIds.map(async (pid) => {
          const [costsPage, summary] = await Promise.all([
            http.get<Page<CostWire>>(COSTS_PATH, {
              query: { project_id: pid, page_size: 100 },
            }),
            http.get<SummaryWire>(`/finance/projects/${pid}/summary`),
          ]);
          return { costs: costsPage.items, summary };
        })
      );

      const costs = perProject
        .flatMap((p) => p.costs)
        .map((c) => mapCost(c, names));
      const summary = aggregateSummary(perProject.map((p) => p.summary));

      // Backend-authoritative per-project margin (BR-065): the /finance/projects/{id}/summary
      // read above already nets out labour cost; preserve it here instead of letting
      // a caller (e.g. /reports) recompute margin from raw milestones+costs and
      // silently drop the labour term.
      const projectSummaries: FinancialProjectSummary[] = perProject
        .map((p) => p.summary)
        .map((s) => ({
          projectId: s.projectId,
          projectName: names.projects.get(s.projectId) ?? "",
          contractedCents: s.contracted,
          receivedCents: s.received,
          pendingCents: s.pending,
          costsCents: s.costsTotal,
          laborCostCents: s.laborCost,
          marginCents: s.margin,
          marginRatio: s.contracted > 0 ? s.margin / s.contracted : 0,
        }))
        .sort((a, b) => b.contractedCents - a.contractedCents);

      return {
        summary,
        milestones: [...milestones].sort((a, b) =>
          a.expectedDate.localeCompare(b.expectedDate)
        ),
        costs: [...costs].sort((a, b) =>
          b.incurredDate.localeCompare(a.incurredDate)
        ),
        projectSummaries,
      };
    } catch (err) {
      throw toFinanceError(err);
    }
  },

  async createMilestone(input, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    try {
      const created = await http.post<MilestoneWire>(MILESTONES_PATH, {
        projectId: input.projectId,
        description: input.description,
        amount: input.amountCents,
        expectedDate: input.expectedDate,
        completionCriteria: input.completionCriteria,
        // Create has no external_invoice_ref field; the plain ref maps to `reference`.
        reference: input.externalInvoiceRef,
      });
      return mapMilestone(created);
    } catch (err) {
      throw toFinanceError(err);
    }
  },

  async updateMilestone(id, input, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    try {
      // Backend PATCH has no project_id — projectId in the input is not moved.
      const updated = await http.patch<MilestoneWire>(`${MILESTONES_PATH}/${id}`, {
        description: input.description,
        amount: input.amountCents,
        expectedDate: input.expectedDate,
        completionCriteria: input.completionCriteria,
        reference: input.externalInvoiceRef,
      });
      return mapMilestone(updated);
    } catch (err) {
      throw toFinanceError(err);
    }
  },

  async recordPayment(id, input, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    try {
      // The status endpoint wants the CUMULATIVE received total; the input carries
      // only the increment, so read the current milestone first.
      const current = await http.get<MilestoneWire>(`${MILESTONES_PATH}/${id}`);
      const cumulative = current.receivedAmount + input.amountCents;
      const fullyPaid = cumulative >= current.amount;
      const updated = await http.post<MilestoneWire>(
        `${MILESTONES_PATH}/${id}/status`,
        {
          status: fullyPaid ? "paid" : "partially_paid",
          receivedAmount: cumulative,
          paidDate: input.paidDate,
          externalInvoiceRef: input.externalInvoiceRef ?? undefined,
        }
      );
      return mapMilestone(updated);
    } catch (err) {
      throw toFinanceError(err);
    }
  },

  async restoreMilestone(prev, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    try {
      // INTEGRATION-GAP: no snapshot-restore endpoint. Best-effort restores only
      // the editable metadata via PATCH; status/receivedAmount changes and
      // re-creating a deleted milestone are NOT reversible server-side (a PATCH on
      // a paid/cancelled milestone is rejected by the backend and surfaces as an
      // error, which is the honest outcome for those undos).
      const updated = await http.patch<MilestoneWire>(
        `${MILESTONES_PATH}/${prev.id}`,
        {
          description: prev.description,
          amount: prev.amountCents,
          expectedDate: prev.expectedDate,
          completionCriteria: prev.completionCriteria,
          reference: prev.externalInvoiceRef,
        }
      );
      return mapMilestone(updated);
    } catch (err) {
      throw toFinanceError(err);
    }
  },

  async cancelMilestone(id, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    try {
      const updated = await http.post<MilestoneWire>(
        `${MILESTONES_PATH}/${id}/status`,
        {
          status: "cancelled",
          // Backend requires a cancellation reason (CANCEL_REASON_REQUIRED); the
          // mock signature carries none, so a neutral placeholder is sent.
          // INTEGRATION-GAP: cancel reason not captured by the UI contract.
          reason: "Cancelado pela aplicação.",
        }
      );
      return mapMilestone(updated);
    } catch (err) {
      throw toFinanceError(err);
    }
  },

  async createCost(input, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    try {
      // INTEGRATION-GAP: category — dropped on create; backend has no category
      // column. It round-trips back as "other" via mapCost.
      const created = await http.post<CostWire>(COSTS_PATH, {
        projectId: input.projectId,
        description: input.description,
        amount: input.amountCents,
        date: input.incurredDate,
      });
      return mapCost(created);
    } catch (err) {
      throw toFinanceError(err);
    }
  },

  async deleteCost(id, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    try {
      await http.delete<void>(`${COSTS_PATH}/${id}`);
    } catch (err) {
      throw toFinanceError(err);
    }
  },

  async restoreCost(cost, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    try {
      // INTEGRATION-GAP: no restore-by-id endpoint — re-creates the line as a new
      // row (new id, category not persisted). Adequate for undo of a delete.
      await http.post<CostWire>(COSTS_PATH, {
        projectId: cost.projectId,
        description: cost.description,
        amount: cost.amountCents,
        date: cost.incurredDate,
      });
    } catch (err) {
      throw toFinanceError(err);
    }
  },
};
