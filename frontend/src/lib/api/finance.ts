/**
 * Finance API client — MOCK implementation (F14, GATED).
 *
 * Backend is not wired yet. This module exports a typed `financeApi` whose
 * methods return promises exactly as the real HTTP client will. The integration
 * agent replaces the bodies with real `fetch` calls to FastAPI WITHOUT changing
 * the signatures. UI code (via TanStack Query) depends only on the `FinanceApi`
 * interface below.
 *
 * ⚠️ The client itself enforces the access boundary (BR-008/066): every method
 * that returns or mutates financial data refuses `membro`, and refuses a
 * `gestor` without the payments grant — mirroring the backend contract so the
 * UI never accidentally surfaces financials. See `canAccessFinance`.
 *
 * Margin is LIVE (BR-065): the summary is recomputed from the current
 * milestones + costs on every read and after every mutation.
 */

import { addDays, format, parseISO, startOfDay } from "date-fns";
import type { Role } from "@/lib/session";
import {
  canAccessFinance,
  FinanceError,
  type FinanceOverview,
  type FinancialSummary,
  type MilestoneInput,
  type PaymentMilestone,
  type PaymentMilestoneStatus,
  type ProjectCost,
  type ProjectCostInput,
  type RecordPaymentInput,
} from "./finance-types";

const MOCK_LATENCY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoDate(offsetDays: number): string {
  return format(addDays(startOfDay(new Date()), offsetDays), "yyyy-MM-dd");
}

/** Blended internal cost of logged time, in cents. Mock stand-in for F14 time cost. */
const TIME_COST_CENTS = 1_842_00; // €1 842,00

/* ------------------------------------------------------------------ *
 * Seed data (dates relative to today so overdue/due-soon are meaningful)
 * ------------------------------------------------------------------ */

let milestones: PaymentMilestone[] = [];
let costs: ProjectCost[] = [];
let seeded = false;

function seed(): void {
  if (seeded) return;
  seeded = true;

  milestones = [
    {
      id: "pm-1",
      projectId: "p-1",
      projectName: "Website — Solar do Douro",
      clientName: "Solar do Douro",
      description: "Adjudicação — arranque do projeto",
      amountCents: 4_500_00,
      expectedDate: isoDate(-40),
      invoicedDate: isoDate(-40),
      paidDate: isoDate(-33),
      receivedAmountCents: 4_500_00,
      completionCriteria: "Contrato assinado e reunião de arranque realizada.",
      externalInvoiceRef: "REF-2026-014",
      status: "paid",
    },
    {
      id: "pm-2",
      projectId: "p-1",
      projectName: "Website — Solar do Douro",
      clientName: "Solar do Douro",
      description: "Entrega do design aprovado",
      amountCents: 3_500_00,
      expectedDate: isoDate(-3),
      invoicedDate: isoDate(-6),
      paidDate: null,
      receivedAmountCents: 1_500_00,
      completionCriteria: "Maquetes finais aprovadas por escrito pelo cliente.",
      externalInvoiceRef: "REF-2026-021",
      status: "partially_paid",
    },
    {
      id: "pm-3",
      projectId: "p-2",
      projectName: "Rebranding — Adega Vale",
      clientName: "Adega Vale",
      description: "Manual de marca entregue",
      amountCents: 6_200_00,
      expectedDate: isoDate(-5),
      invoicedDate: isoDate(-8),
      paidDate: null,
      receivedAmountCents: 0,
      completionCriteria: "Manual de marca em PDF entregue e validado.",
      externalInvoiceRef: "REF-2026-018",
      status: "overdue",
    },
    {
      id: "pm-4",
      projectId: "p-2",
      projectName: "Rebranding — Adega Vale",
      clientName: "Adega Vale",
      description: "Aplicações de marca — segunda fase",
      amountCents: 4_800_00,
      expectedDate: isoDate(4),
      invoicedDate: null,
      paidDate: null,
      receivedAmountCents: 0,
      completionCriteria: "Estacionário e sinalética entregues em produção.",
      externalInvoiceRef: null,
      status: "planned",
    },
    {
      id: "pm-5",
      projectId: "p-3",
      projectName: "App Fidelização — Lumina",
      clientName: "Lumina",
      description: "Entrega da versão beta",
      amountCents: 9_000_00,
      expectedDate: isoDate(18),
      invoicedDate: null,
      paidDate: null,
      receivedAmountCents: 0,
      completionCriteria: "Build beta publicada em TestFlight e Play Console.",
      externalInvoiceRef: null,
      status: "planned",
    },
    {
      id: "pm-6",
      projectId: "p-3",
      projectName: "App Fidelização — Lumina",
      clientName: "Lumina",
      description: "Fase de descoberta (cancelada)",
      amountCents: 2_000_00,
      expectedDate: isoDate(-20),
      invoicedDate: null,
      paidDate: null,
      receivedAmountCents: 0,
      completionCriteria: "Workshop de descoberta e documento de âmbito.",
      externalInvoiceRef: null,
      status: "cancelled",
    },
  ];

  costs = [
    {
      id: "pc-1",
      projectId: "p-2",
      projectName: "Rebranding — Adega Vale",
      description: "Fotografia de produto (subcontratado)",
      category: "subcontracting",
      amountCents: 1_200_00,
      incurredDate: isoDate(-15),
    },
    {
      id: "pc-2",
      projectId: "p-3",
      projectName: "App Fidelização — Lumina",
      description: "Licenças de API de mapas (12 meses)",
      category: "software",
      amountCents: 540_00,
      incurredDate: isoDate(-10),
    },
    {
      id: "pc-3",
      projectId: "p-1",
      projectName: "Website — Solar do Douro",
      description: "Deslocação à vindima para sessão fotográfica",
      category: "travel",
      amountCents: 180_00,
      incurredDate: isoDate(-8),
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Derivations
 * ------------------------------------------------------------------ */

/** Recompute the milestone status from its amounts + expected date (live). */
function deriveStatus(m: PaymentMilestone): PaymentMilestoneStatus {
  if (m.status === "cancelled") return "cancelled";
  if (m.receivedAmountCents >= m.amountCents && m.amountCents > 0) return "paid";
  if (m.receivedAmountCents > 0) {
    // Partially paid, but still overdue if past the expected date.
    return isPastDue(m) ? "overdue" : "partially_paid";
  }
  if (isPastDue(m)) return "overdue";
  return m.invoicedDate ? "invoiced" : "planned";
}

function isPastDue(m: PaymentMilestone): boolean {
  const today = startOfDay(new Date());
  return parseISO(m.expectedDate).getTime() < today.getTime();
}

function withDerivedStatus(m: PaymentMilestone): PaymentMilestone {
  return { ...m, status: deriveStatus(m) };
}

/** Build the live summary (BR-065) from the current milestones + costs. */
function computeSummary(): FinancialSummary {
  const active = milestones.filter((m) => m.status !== "cancelled");
  const contractedCents = active.reduce((sum, m) => sum + m.amountCents, 0);
  const receivedCents = active.reduce((sum, m) => sum + m.receivedAmountCents, 0);
  const costsCents = costs.reduce((sum, c) => sum + c.amountCents, 0);
  const timeCostCents = TIME_COST_CENTS;
  const marginCents = contractedCents - costsCents - timeCostCents;
  return {
    contractedCents,
    receivedCents,
    pendingCents: Math.max(0, contractedCents - receivedCents),
    costsCents,
    timeCostCents,
    marginCents,
    marginRatio: contractedCents > 0 ? marginCents / contractedCents : 0,
  };
}

function snapshot(): FinanceOverview {
  const withStatus = milestones.map(withDerivedStatus);
  milestones = withStatus; // persist derived status for the session
  return {
    summary: computeSummary(),
    milestones: [...withStatus].sort((a, b) =>
      a.expectedDate.localeCompare(b.expectedDate)
    ),
    costs: [...costs].sort((a, b) => b.incurredDate.localeCompare(a.incurredDate)),
  };
}

/* ------------------------------------------------------------------ *
 * Access guard
 * ------------------------------------------------------------------ */

function assertAccess(role: Role, paymentsGrant: boolean): void {
  if (!canAccessFinance(role, paymentsGrant)) {
    throw new FinanceError("forbidden", "Financial data is not available for this user.");
  }
}

function findMilestone(id: string): PaymentMilestone {
  const m = milestones.find((x) => x.id === id);
  if (!m) throw new FinanceError("network", `Unknown milestone: ${id}`);
  return m;
}

/* ------------------------------------------------------------------ *
 * Public interface
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

const PROJECT_NAMES: Record<string, { projectName: string; clientName: string }> = {
  "p-1": { projectName: "Website — Solar do Douro", clientName: "Solar do Douro" },
  "p-2": { projectName: "Rebranding — Adega Vale", clientName: "Adega Vale" },
  "p-3": { projectName: "App Fidelização — Lumina", clientName: "Lumina" },
};

function resolveProject(projectId: string) {
  return (
    PROJECT_NAMES[projectId] ?? { projectName: projectId, clientName: "—" }
  );
}

export const financeApi: FinanceApi = {
  async getOverview(role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    seed();
    await delay(MOCK_LATENCY_MS);
    return snapshot();
  },

  async createMilestone(input, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    seed();
    await delay(MOCK_LATENCY_MS);
    const project = resolveProject(input.projectId);
    const created: PaymentMilestone = {
      id: `pm-${Math.random().toString(36).slice(2, 8)}`,
      projectId: input.projectId,
      projectName: project.projectName,
      clientName: project.clientName,
      description: input.description,
      amountCents: input.amountCents,
      expectedDate: input.expectedDate,
      invoicedDate: null,
      paidDate: null,
      receivedAmountCents: 0,
      completionCriteria: input.completionCriteria,
      externalInvoiceRef: input.externalInvoiceRef,
      status: "planned",
    };
    milestones = [...milestones, withDerivedStatus(created)];
    return withDerivedStatus(created);
  },

  async updateMilestone(id, input, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    await delay(MOCK_LATENCY_MS);
    const existing = findMilestone(id);
    const project = resolveProject(input.projectId);
    const updated: PaymentMilestone = {
      ...existing,
      projectId: input.projectId,
      projectName: project.projectName,
      clientName: project.clientName,
      description: input.description,
      amountCents: input.amountCents,
      expectedDate: input.expectedDate,
      completionCriteria: input.completionCriteria,
      externalInvoiceRef: input.externalInvoiceRef,
    };
    const derived = withDerivedStatus(updated);
    milestones = milestones.map((m) => (m.id === id ? derived : m));
    return derived;
  },

  async recordPayment(id, input, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    await delay(MOCK_LATENCY_MS);
    const existing = findMilestone(id);
    const received = existing.receivedAmountCents + input.amountCents;
    const updated: PaymentMilestone = {
      ...existing,
      receivedAmountCents: received,
      paidDate: input.paidDate,
      invoicedDate: existing.invoicedDate ?? input.paidDate,
      externalInvoiceRef: input.externalInvoiceRef ?? existing.externalInvoiceRef,
    };
    const derived = withDerivedStatus(updated);
    milestones = milestones.map((m) => (m.id === id ? derived : m));
    return derived;
  },

  async restoreMilestone(prev, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    await delay(MOCK_LATENCY_MS / 2);
    const derived = withDerivedStatus(prev);
    milestones = milestones.some((m) => m.id === prev.id)
      ? milestones.map((m) => (m.id === prev.id ? derived : m))
      : [...milestones, derived];
    return derived;
  },

  async cancelMilestone(id, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    await delay(MOCK_LATENCY_MS);
    const existing = findMilestone(id);
    const cancelled: PaymentMilestone = { ...existing, status: "cancelled" };
    milestones = milestones.map((m) => (m.id === id ? cancelled : m));
    return cancelled;
  },

  async createCost(input, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    seed();
    await delay(MOCK_LATENCY_MS);
    const project = resolveProject(input.projectId);
    const created: ProjectCost = {
      id: `pc-${Math.random().toString(36).slice(2, 8)}`,
      projectId: input.projectId,
      projectName: project.projectName,
      description: input.description,
      category: input.category,
      amountCents: input.amountCents,
      incurredDate: input.incurredDate,
    };
    costs = [...costs, created];
    return created;
  },

  async deleteCost(id, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    await delay(MOCK_LATENCY_MS);
    costs = costs.filter((c) => c.id !== id);
  },

  async restoreCost(cost, role, paymentsGrant) {
    assertAccess(role, paymentsGrant);
    await delay(MOCK_LATENCY_MS / 2);
    if (!costs.some((c) => c.id === cost.id)) costs = [...costs, cost];
  },
};
