/**
 * Pure report aggregations (F19). Every function derives rows from the scoped
 * `ReportDataset` (from `reports.ts`) with the active `ReportFilters` applied
 * first — no data is invented here, only counted, summed and averaged.
 *
 * Kept framework-free (no React, no i18n) so it is trivially testable and the
 * same rows feed both the on-screen tables/charts AND the CSV export.
 */

import type { ReportDataset, ReportFilters } from "@/lib/api/reports-types";
import type {
  Opportunity,
  PipelineStageId,
  LostReason,
} from "@/lib/api/opportunities-types";
import type { ProjectListItem, ProjectHealth, ProjectState } from "@/lib/api/projects-types";
import type { Task, TaskState } from "@/lib/api/tasks-types";
import type { CompanySource } from "@/lib/api/crm-types";
import type { PaymentMilestoneStatus } from "@/lib/api/finance-types";

const TASK_STATE_SET = new Set<TaskState>([
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
]);

/** Today as `yyyy-mm-dd` (local wall clock). */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function dateInRange(date: string | null, from: string | null, to: string | null): boolean {
  if (!date) return true; // undated rows are never excluded by a range
  const day = date.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** Effective health = published override, else the system suggestion. */
export function effectiveHealth(p: ProjectListItem): ProjectHealth {
  return p.publishedHealth ?? p.suggestedHealth;
}

/**
 * Apply the filter bar to every dataset dimension. Client / project / member
 * are mapped across related entities (e.g. a client filter reaches tasks via
 * the project → client relation).
 */
export function filterDataset(data: ReportDataset, f: ReportFilters): ReportDataset {
  // project → client lookup, for client-scoping task/time/finance rows.
  const projectClient = new Map<string, string>();
  for (const p of data.projects) projectClient.set(p.id, p.clientId);

  const clientProjectIds = new Set(
    f.clientId
      ? data.projects.filter((p) => p.clientId === f.clientId).map((p) => p.id)
      : []
  );

  const isTaskState = f.state != null && TASK_STATE_SET.has(f.state as TaskState);

  const opportunities = data.opportunities.filter(
    (o) =>
      dateInRange(o.createdAt, f.from, f.to) &&
      (!f.clientId || o.companyId === f.clientId) &&
      (!f.projectId || o.projectId === f.projectId) &&
      (!f.memberId || o.ownerId === f.memberId)
  );

  const companies = data.companies.filter(
    (c) =>
      (!f.clientId || c.id === f.clientId) && (!f.memberId || c.ownerId === f.memberId)
  );

  const projects = data.projects.filter(
    (p) =>
      (!f.clientId || p.clientId === f.clientId) &&
      (!f.projectId || p.id === f.projectId) &&
      (!f.memberId || p.managerId === f.memberId) &&
      (!f.state || p.state === (f.state as ProjectState))
  );

  const tasks = data.tasks.filter((t) => {
    if (f.projectId && t.projectId !== f.projectId) return false;
    if (f.clientId && !clientProjectIds.has(t.projectId)) return false;
    if (f.memberId && !t.assignees.some((a) => a.userId === f.memberId)) return false;
    if (isTaskState && t.state !== (f.state as TaskState)) return false;
    if (!dateInRange(t.dueDate, f.from, f.to)) return false;
    return true;
  });

  const timeEntries = data.timeEntries.filter((e) => {
    if (f.projectId && e.projectId !== f.projectId) return false;
    if (f.clientId && !clientProjectIds.has(e.projectId)) return false;
    if (f.memberId && e.userId !== f.memberId) return false;
    if (!dateInRange(e.startedAt, f.from, f.to)) return false;
    return true;
  });

  const team = data.team.filter((m) => !f.memberId || m.userId === f.memberId);

  const finance = data.finance
    ? {
        milestones: data.finance.milestones.filter((m) => {
          if (f.projectId && m.projectId !== f.projectId) return false;
          if (f.clientId && !clientProjectIds.has(m.projectId)) return false;
          if (!dateInRange(m.expectedDate, f.from, f.to)) return false;
          return true;
        }),
        costs: data.finance.costs.filter((c) => {
          if (f.projectId && c.projectId !== f.projectId) return false;
          if (f.clientId && !clientProjectIds.has(c.projectId)) return false;
          if (!dateInRange(c.incurredDate, f.from, f.to)) return false;
          return true;
        }),
      }
    : null;

  return { ...data, opportunities, companies, projects, tasks, timeEntries, team, finance };
}

/* ================================================================== *
 * COMERCIAL
 * ================================================================== */

const openOpps = (opps: Opportunity[]) => opps.filter((o) => o.outcome === null);

export interface StageCountRow {
  stageId: PipelineStageId;
  count: number;
}
export function opportunitiesByStage(
  opps: Opportunity[],
  stageOrder: PipelineStageId[]
): StageCountRow[] {
  const counts = new Map<PipelineStageId, number>();
  for (const o of openOpps(opps)) counts.set(o.stageId, (counts.get(o.stageId) ?? 0) + 1);
  return stageOrder.map((stageId) => ({ stageId, count: counts.get(stageId) ?? 0 }));
}

export interface StageValueRow {
  stageId: PipelineStageId;
  valueCents: number;
}
export function valueByStage(
  opps: Opportunity[],
  stageOrder: PipelineStageId[]
): StageValueRow[] {
  const sums = new Map<PipelineStageId, number>();
  for (const o of openOpps(opps)) {
    sums.set(o.stageId, (sums.get(o.stageId) ?? 0) + (o.valueCents ?? 0));
  }
  return stageOrder.map((stageId) => ({ stageId, valueCents: sums.get(stageId) ?? 0 }));
}

export interface ConversionSummary {
  open: number;
  won: number;
  lost: number;
  closed: number;
  /** won ÷ (won + lost), 0..1. */
  rate: number;
}
export function conversionSummary(opps: Opportunity[]): ConversionSummary {
  let open = 0,
    won = 0,
    lost = 0;
  for (const o of opps) {
    if (o.outcome === "won") won++;
    else if (o.outcome === "lost") lost++;
    else open++;
  }
  const closed = won + lost;
  return { open, won, lost, closed, rate: closed === 0 ? 0 : won / closed };
}

export interface WonLostValue {
  wonCents: number;
  lostCents: number;
  wonCount: number;
  lostCount: number;
}
export function wonLostValue(opps: Opportunity[]): WonLostValue {
  const acc: WonLostValue = { wonCents: 0, lostCents: 0, wonCount: 0, lostCount: 0 };
  for (const o of opps) {
    if (o.outcome === "won") {
      acc.wonCents += o.valueCents ?? 0;
      acc.wonCount++;
    } else if (o.outcome === "lost") {
      acc.lostCents += o.valueCents ?? 0;
      acc.lostCount++;
    }
  }
  return acc;
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b.slice(0, 10)}T00:00:00`).getTime() - new Date(`${a.slice(0, 10)}T00:00:00`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Average calendar days from creation to a terminal outcome. */
export function avgDaysToClose(opps: Opportunity[]): { avgDays: number; sample: number } {
  const closed = opps.filter((o) => o.outcome !== null && (o.wonAt || o.lostAt));
  if (closed.length === 0) return { avgDays: 0, sample: 0 };
  const total = closed.reduce(
    (s, o) => s + daysBetween(o.createdAt, (o.wonAt ?? o.lostAt) as string),
    0
  );
  return { avgDays: Math.round(total / closed.length), sample: closed.length };
}

export interface OwnerPerfRow {
  ownerId: string;
  ownerName: string;
  open: number;
  won: number;
  lost: number;
  wonValueCents: number;
}
export function ownerPerformance(opps: Opportunity[]): OwnerPerfRow[] {
  const map = new Map<string, OwnerPerfRow>();
  for (const o of opps) {
    const row =
      map.get(o.ownerId) ??
      { ownerId: o.ownerId, ownerName: o.ownerName, open: 0, won: 0, lost: 0, wonValueCents: 0 };
    if (o.outcome === "won") {
      row.won++;
      row.wonValueCents += o.valueCents ?? 0;
    } else if (o.outcome === "lost") row.lost++;
    else row.open++;
    map.set(o.ownerId, row);
  }
  return [...map.values()].sort((a, b) => b.won - a.won || b.open - a.open);
}

export interface LostReasonRow {
  reason: LostReason;
  count: number;
}
export function lostReasons(opps: Opportunity[]): LostReasonRow[] {
  const map = new Map<LostReason, number>();
  for (const o of opps) {
    if (o.outcome === "lost" && o.lostReason) {
      map.set(o.lostReason, (map.get(o.lostReason) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

export interface SourceRow {
  source: CompanySource;
  count: number;
}
export function clientSources(
  companies: { source: CompanySource }[]
): SourceRow[] {
  const map = new Map<CompanySource, number>();
  for (const c of companies) map.set(c.source, (map.get(c.source) ?? 0) + 1);
  return [...map.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

/* ================================================================== *
 * PROJETOS
 * ================================================================== */

export interface StateCountRow {
  state: ProjectState;
  count: number;
}
export function projectsByState(
  projects: ProjectListItem[],
  order: ProjectState[]
): StateCountRow[] {
  const map = new Map<ProjectState, number>();
  for (const p of projects) map.set(p.state, (map.get(p.state) ?? 0) + 1);
  return order.map((state) => ({ state, count: map.get(state) ?? 0 }));
}

export interface HealthCountRow {
  health: ProjectHealth;
  count: number;
}
export function projectsByHealth(
  projects: ProjectListItem[],
  order: ProjectHealth[]
): HealthCountRow[] {
  const map = new Map<ProjectHealth, number>();
  for (const p of projects) {
    const h = effectiveHealth(p);
    map.set(h, (map.get(h) ?? 0) + 1);
  }
  return order.map((health) => ({ health, count: map.get(health) ?? 0 }));
}

export interface RiskProjectRow {
  id: string;
  name: string;
  clientName: string;
  managerName: string;
  progress: number;
  dueDate: string;
  health: ProjectHealth;
}
export function projectsAtRisk(projects: ProjectListItem[]): RiskProjectRow[] {
  return projects
    .filter((p) => effectiveHealth(p) === "at_risk")
    .map((p) => ({
      id: p.id,
      name: p.name,
      clientName: p.clientName,
      managerName: p.managerName,
      progress: p.progress,
      dueDate: p.dueDate,
      health: effectiveHealth(p),
    }))
    .sort((a, b) => a.progress - b.progress);
}

export function averageProgress(projects: ProjectListItem[]): number {
  const active = projects.filter((p) => p.state !== "completed" && p.state !== "cancelled");
  const base = active.length > 0 ? active : projects;
  if (base.length === 0) return 0;
  return Math.round(base.reduce((s, p) => s + p.progress, 0) / base.length);
}

export interface TaskFlagRow {
  projectId: string;
  projectName: string;
  overdue: number;
  blocked: number;
}
export function taskFlagsByProject(tasks: Task[], today: string): TaskFlagRow[] {
  const map = new Map<string, TaskFlagRow>();
  for (const t of tasks) {
    const row =
      map.get(t.projectId) ??
      { projectId: t.projectId, projectName: t.projectName, overdue: 0, blocked: 0 };
    if (t.state === "blocked") row.blocked++;
    if (t.state !== "done" && t.dueDate && t.dueDate.slice(0, 10) < today) row.overdue++;
    map.set(t.projectId, row);
  }
  return [...map.values()]
    .filter((r) => r.overdue > 0 || r.blocked > 0)
    .sort((a, b) => b.overdue + b.blocked - (a.overdue + a.blocked));
}

export interface ProjectHoursRow {
  projectId: string;
  projectName: string;
  budgetHours: number;
  usedHours: number;
}
export function projectHours(projects: ProjectListItem[]): ProjectHoursRow[] {
  return projects
    .map((p) => ({
      projectId: p.id,
      projectName: p.name,
      budgetHours: p.hoursBudget,
      usedHours: p.hoursUsed,
    }))
    .sort((a, b) => b.usedHours - a.usedHours);
}

/* ================================================================== *
 * EQUIPA
 * ================================================================== */

export interface MemberLoadRow {
  userId: string;
  name: string;
  allocatedHours: number;
  netCapacityHours: number;
  utilizationRatio: number;
}
export function memberLoad(team: ReportDataset["team"]): MemberLoadRow[] {
  return team
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      allocatedHours: m.allocatedHours,
      netCapacityHours: m.netCapacityHours,
      utilizationRatio: m.utilizationRatio,
    }))
    .sort((a, b) => b.utilizationRatio - a.utilizationRatio);
}

export interface MemberTaskRow {
  userId: string;
  name: string;
  done: number;
  overdue: number;
  open: number;
}
/** Per-member task counts derived from the (scoped) task store. */
export function memberTaskCounts(
  team: ReportDataset["team"],
  tasks: Task[],
  today: string
): MemberTaskRow[] {
  const rows = new Map<string, MemberTaskRow>();
  for (const m of team) {
    rows.set(m.userId, { userId: m.userId, name: m.name, done: 0, overdue: 0, open: 0 });
  }
  for (const t of tasks) {
    for (const a of t.assignees) {
      const row = rows.get(a.userId);
      if (!row) continue;
      if (t.state === "done") row.done++;
      else {
        row.open++;
        if (t.dueDate && t.dueDate.slice(0, 10) < today) row.overdue++;
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open);
}

export interface MemberHoursRow {
  userId: string;
  name: string;
  loggedHours: number;
  billableHours: number;
  /** billable ÷ logged, 0..1. */
  billableRatio: number;
}
export function memberHours(team: ReportDataset["team"]): MemberHoursRow[] {
  return team
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      loggedHours: m.loggedHours,
      billableHours: m.billableHours,
      billableRatio: m.loggedHours > 0 ? m.billableHours / m.loggedHours : 0,
    }))
    .sort((a, b) => b.loggedHours - a.loggedHours);
}

export interface ProjectTimeRow {
  projectId: string;
  projectName: string;
  hours: number;
  billableHours: number;
}
export function timeByProject(timeEntries: ReportDataset["timeEntries"]): ProjectTimeRow[] {
  const map = new Map<string, { projectName: string; minutes: number; billable: number }>();
  for (const e of timeEntries) {
    const row = map.get(e.projectId) ?? { projectName: e.projectName, minutes: 0, billable: 0 };
    row.minutes += e.durationMinutes;
    if (e.billable) row.billable += e.durationMinutes;
    map.set(e.projectId, row);
  }
  return [...map.entries()]
    .map(([projectId, r]) => ({
      projectId,
      projectName: r.projectName,
      hours: Math.round((r.minutes / 60) * 10) / 10,
      billableHours: Math.round((r.billable / 60) * 10) / 10,
    }))
    .sort((a, b) => b.hours - a.hours);
}

/* ================================================================== *
 * FINANCEIRO
 * ================================================================== */

const PENDING_STATUSES = new Set<PaymentMilestoneStatus>([
  "planned",
  "invoiced",
  "partially_paid",
  "overdue",
]);

export interface FinanceTotals {
  contractedCents: number;
  receivedCents: number;
  pendingCents: number;
  overdueCents: number;
}
export function financeTotals(
  finance: NonNullable<ReportDataset["finance"]>
): FinanceTotals {
  let contractedCents = 0,
    receivedCents = 0,
    overdueCents = 0;
  for (const m of finance.milestones) {
    if (m.status === "cancelled") continue;
    contractedCents += m.amountCents;
    receivedCents += m.receivedAmountCents;
    if (m.status === "overdue") {
      overdueCents += Math.max(0, m.amountCents - m.receivedAmountCents);
    }
  }
  return {
    contractedCents,
    receivedCents,
    pendingCents: Math.max(0, contractedCents - receivedCents),
    overdueCents,
  };
}

export interface PaymentRow {
  id: string;
  projectName: string;
  clientName: string;
  description: string;
  amountCents: number;
  receivedCents: number;
  outstandingCents: number;
  expectedDate: string;
  status: PaymentMilestoneStatus;
}
export function pendingPayments(
  finance: NonNullable<ReportDataset["finance"]>
): PaymentRow[] {
  return finance.milestones
    .filter((m) => PENDING_STATUSES.has(m.status))
    .map((m) => ({
      id: m.id,
      projectName: m.projectName,
      clientName: m.clientName,
      description: m.description,
      amountCents: m.amountCents,
      receivedCents: m.receivedAmountCents,
      outstandingCents: Math.max(0, m.amountCents - m.receivedAmountCents),
      expectedDate: m.expectedDate,
      status: m.status,
    }))
    .sort((a, b) => {
      // overdue first, then by soonest expected date
      if (a.status === "overdue" && b.status !== "overdue") return -1;
      if (b.status === "overdue" && a.status !== "overdue") return 1;
      return a.expectedDate.localeCompare(b.expectedDate);
    });
}

export interface ProjectMarginRow {
  projectId: string;
  projectName: string;
  contractedCents: number;
  receivedCents: number;
  costsCents: number;
  marginCents: number;
  marginRatio: number;
}
export function marginByProject(
  finance: NonNullable<ReportDataset["finance"]>
): ProjectMarginRow[] {
  const map = new Map<string, ProjectMarginRow>();
  const get = (id: string, name: string): ProjectMarginRow => {
    let r = map.get(id);
    if (!r) {
      r = {
        projectId: id,
        projectName: name,
        contractedCents: 0,
        receivedCents: 0,
        costsCents: 0,
        marginCents: 0,
        marginRatio: 0,
      };
      map.set(id, r);
    }
    return r;
  };
  for (const m of finance.milestones) {
    if (m.status === "cancelled") continue;
    const r = get(m.projectId, m.projectName);
    r.contractedCents += m.amountCents;
    r.receivedCents += m.receivedAmountCents;
  }
  for (const c of finance.costs) {
    const r = get(c.projectId, c.projectName);
    r.costsCents += c.amountCents;
  }
  const rows = [...map.values()];
  for (const r of rows) {
    r.marginCents = r.contractedCents - r.costsCents;
    r.marginRatio = r.contractedCents > 0 ? r.marginCents / r.contractedCents : 0;
  }
  return rows.sort((a, b) => b.contractedCents - a.contractedCents);
}

export interface MonthlyPointRow {
  /** yyyy-mm */
  month: string;
  contractedCents: number;
  receivedCents: number;
}
export function monthlyEvolution(
  finance: NonNullable<ReportDataset["finance"]>
): MonthlyPointRow[] {
  const map = new Map<string, MonthlyPointRow>();
  const get = (month: string): MonthlyPointRow => {
    let r = map.get(month);
    if (!r) {
      r = { month, contractedCents: 0, receivedCents: 0 };
      map.set(month, r);
    }
    return r;
  };
  for (const m of finance.milestones) {
    if (m.status === "cancelled") continue;
    get(m.expectedDate.slice(0, 7)).contractedCents += m.amountCents;
    if (m.paidDate && m.receivedAmountCents > 0) {
      get(m.paidDate.slice(0, 7)).receivedCents += m.receivedAmountCents;
    }
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}
