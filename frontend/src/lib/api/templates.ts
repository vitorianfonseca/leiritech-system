/**
 * Project templates API client — MOCK implementation (F9).
 *
 * Backend is not wired yet. This module exports a typed `templatesApi` whose
 * methods return promises exactly as the real HTTP client will. The integration
 * agent replaces the bodies with real `fetch` calls to FastAPI WITHOUT changing
 * the signatures. UI code (via TanStack Query) depends only on the
 * `TemplatesApi` interface below.
 *
 * This is the CANONICAL template source. #31 (conversion wizard) and #42
 * (settings nav) import from here — do not duplicate the fixtures elsewhere.
 *
 * Mutations mirror the backend access rule (matrix §9): only Admin may write.
 * Reads are open to any caller (the route/UI gate to Admin+Gestor).
 */

import { format } from "date-fns";
import type { Role } from "@/lib/session";
import { http } from "./http";
import {
  canManageTemplates,
  summarize,
  TemplateError,
  type PhaseInput,
  type ProjectTemplate,
  type TaskInput,
  type TemplateDetail,
  type TemplateInput,
  type TemplatePhase,
  type TemplateTask,
} from "./template-types";

const MOCK_LATENCY_MS = 350;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function rid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ *
 * Internal record shape (summary fields + nested phases)
 * ------------------------------------------------------------------ */

interface TemplateRecord {
  id: string;
  name: string;
  type: TemplateDetail["type"];
  description: string;
  active: boolean;
  expectedDurationDays: number;
  updatedAt: string;
  phases: TemplatePhase[];
}

/* ------------------------------------------------------------------ *
 * Seed — the 4 demo templates (pt-PT content).
 * Content is DATA (canonical pt-PT), not UI chrome.
 * ------------------------------------------------------------------ */

/** Compact phase/task authoring helper for the seed. */
function seedPhase(
  templateId: string,
  index: number,
  name: string,
  expectedDurationDays: number,
  milestone: string | null,
  tasks: Array<[string, TemplateTask["roleResponsible"], number]>,
): TemplatePhase {
  const phaseId = `${templateId}-ph-${index + 1}`;
  return {
    id: phaseId,
    templateId,
    name,
    order: index,
    expectedDurationDays,
    isMilestone: milestone !== null,
    milestoneName: milestone,
    tasks: tasks.map(([title, roleResponsible, estimateHours], i) => ({
      id: `${phaseId}-t-${i + 1}`,
      phaseId,
      title,
      roleResponsible,
      estimateHours,
      order: i,
    })),
  };
}

function buildSeed(): TemplateRecord[] {
  const website: TemplateRecord = {
    id: "tpl-website",
    name: "Website institucional",
    type: "website",
    description:
      "Website institucional com design à medida, CMS e publicação. Do arranque à entrega em produção.",
    active: true,
    expectedDurationDays: 45,
    updatedAt: nowIso(),
    phases: [
      seedPhase("tpl-website", 0, "Descoberta e planeamento", 5, null, [
        ["Reunião de arranque com o cliente", "gestor", 3],
        ["Levantamento de requisitos e conteúdos", "consultant", 6],
        ["Definição de mapa do site e âmbito", "gestor", 4],
      ]),
      seedPhase("tpl-website", 1, "Design", 12, "Design aprovado", [
        ["Wireframes das páginas principais", "designer", 10],
        ["Design visual (UI) das páginas-chave", "designer", 20],
        ["Revisão e aprovação do cliente", "gestor", 4],
      ]),
      seedPhase("tpl-website", 2, "Desenvolvimento", 18, null, [
        ["Montagem do tema e componentes", "developer", 32],
        ["Integração de CMS e conteúdos", "developer", 16],
        ["Formulários e integrações", "developer", 10],
      ]),
      seedPhase("tpl-website", 3, "Testes e publicação", 8, "Site em produção", [
        ["Testes de responsividade e navegadores", "qa", 8],
        ["Otimização SEO técnica e desempenho", "developer", 6],
        ["Publicação e verificação em produção", "developer", 4],
      ]),
    ],
  };

  const app: TemplateRecord = {
    id: "tpl-app",
    name: "Aplicação móvel",
    type: "app",
    description:
      "Aplicação móvel iOS e Android, do produto mínimo viável às lojas, com fase beta.",
    active: true,
    expectedDurationDays: 90,
    updatedAt: nowIso(),
    phases: [
      seedPhase("tpl-app", 0, "Descoberta de produto", 10, "Âmbito validado", [
        ["Workshop de descoberta", "consultant", 8],
        ["Definição de funcionalidades do MVP", "gestor", 6],
        ["Arquitetura técnica e stack", "developer", 8],
      ]),
      seedPhase("tpl-app", 1, "Design de produto", 15, "Protótipo aprovado", [
        ["Fluxos e wireframes", "designer", 18],
        ["Design de interface (UI kit)", "designer", 30],
        ["Protótipo interativo e validação", "designer", 12],
      ]),
      seedPhase("tpl-app", 2, "Desenvolvimento", 40, null, [
        ["Configuração de projeto e CI/CD", "developer", 16],
        ["Ecrãs e navegação", "developer", 60],
        ["Integração de API e autenticação", "developer", 40],
        ["Notificações e estado offline", "developer", 24],
      ]),
      seedPhase("tpl-app", 3, "Beta e QA", 15, "Beta publicada", [
        ["Plano de testes e casos", "qa", 12],
        ["Testes funcionais e correções", "qa", 32],
        ["Distribuição TestFlight / Play Console", "developer", 8],
      ]),
      seedPhase("tpl-app", 4, "Lançamento", 10, "App nas lojas", [
        ["Fichas de loja e capturas", "marketing", 8],
        ["Submissão e revisão nas lojas", "developer", 10],
        ["Monitorização pós-lançamento", "developer", 8],
      ]),
    ],
  };

  const consulting: TemplateRecord = {
    id: "tpl-consulting",
    name: "Consultoria e auditoria",
    type: "consulting",
    description:
      "Projeto de consultoria com diagnóstico, recomendações e apresentação final ao cliente.",
    active: true,
    expectedDurationDays: 30,
    updatedAt: nowIso(),
    phases: [
      seedPhase("tpl-consulting", 0, "Enquadramento", 4, null, [
        ["Reunião de arranque e objetivos", "gestor", 3],
        ["Recolha de documentação e acessos", "consultant", 5],
      ]),
      seedPhase("tpl-consulting", 1, "Diagnóstico", 12, "Diagnóstico entregue", [
        ["Entrevistas com stakeholders", "consultant", 12],
        ["Análise de dados e processos", "consultant", 20],
        ["Identificação de oportunidades", "consultant", 8],
      ]),
      seedPhase("tpl-consulting", 2, "Recomendações", 8, null, [
        ["Elaboração do plano de ação", "consultant", 16],
        ["Estimativa de impacto e prioridades", "gestor", 6],
      ]),
      seedPhase("tpl-consulting", 3, "Apresentação", 6, "Relatório final", [
        ["Preparação do relatório final", "consultant", 10],
        ["Apresentação executiva ao cliente", "gestor", 4],
      ]),
    ],
  };

  const maintenance: TemplateRecord = {
    id: "tpl-maintenance",
    name: "Manutenção mensal",
    type: "maintenance",
    description:
      "Avença mensal de manutenção e suporte: monitorização, atualizações e um relatório de fecho.",
    active: true,
    expectedDurationDays: 30,
    updatedAt: nowIso(),
    phases: [
      seedPhase("tpl-maintenance", 0, "Monitorização contínua", 30, null, [
        ["Verificação de disponibilidade e alertas", "developer", 4],
        ["Cópias de segurança e verificação", "developer", 3],
      ]),
      seedPhase("tpl-maintenance", 1, "Atualizações e correções", 30, null, [
        ["Atualizações de segurança e dependências", "developer", 6],
        ["Correção de incidências reportadas", "developer", 8],
        ["Pequenas melhorias solicitadas", "developer", 6],
      ]),
      seedPhase("tpl-maintenance", 2, "Relatório mensal", 3, "Relatório mensal", [
        ["Compilação de métricas do mês", "gestor", 3],
        ["Reunião de balanço com o cliente", "gestor", 2],
      ]),
    ],
  };

  return [website, app, consulting, maintenance];
}

let records: TemplateRecord[] = [];
let seeded = false;

function seed(): void {
  if (seeded) return;
  seeded = true;
  records = buildSeed();
}

/* ------------------------------------------------------------------ *
 * Projections
 * ------------------------------------------------------------------ */

function toSummary(r: TemplateRecord): ProjectTemplate {
  return summarize(
    {
      id: r.id,
      name: r.name,
      type: r.type,
      description: r.description,
      active: r.active,
      expectedDurationDays: r.expectedDurationDays,
      updatedAt: r.updatedAt,
    },
    r.phases,
  );
}

function toDetail(r: TemplateRecord): TemplateDetail {
  return {
    ...toSummary(r),
    phases: r.phases
      .map((p, i) => ({
        ...p,
        order: i,
        tasks: [...p.tasks].sort((a, b) => a.order - b.order).map((t, ti) => ({ ...t, order: ti })),
      }))
      .sort((a, b) => a.order - b.order),
  };
}

function findRecord(id: string): TemplateRecord {
  const r = records.find((x) => x.id === id);
  if (!r) throw new TemplateError("not_found", `Unknown template: ${id}`);
  return r;
}

function findPhase(phaseId: string): { record: TemplateRecord; phase: TemplatePhase } {
  for (const record of records) {
    const phase = record.phases.find((p) => p.id === phaseId);
    if (phase) return { record, phase };
  }
  throw new TemplateError("not_found", `Unknown phase: ${phaseId}`);
}

function touch(r: TemplateRecord): void {
  r.updatedAt = nowIso();
}

function assertManage(role: Role): void {
  if (!canManageTemplates(role)) {
    throw new TemplateError("forbidden", "Only an administrator can edit templates.");
  }
}

/* ------------------------------------------------------------------ *
 * Public interface
 * ------------------------------------------------------------------ */

export interface TemplatesApi {
  /** Summaries for the templates table (read — any caller). */
  list(): Promise<ProjectTemplate[]>;
  /** Full nested template. Returns null when not found (consumed by #31). */
  get(id: string): Promise<TemplateDetail | null>;

  createTemplate(input: TemplateInput, role: Role): Promise<TemplateDetail>;
  updateTemplate(id: string, input: TemplateInput, role: Role): Promise<TemplateDetail>;
  deleteTemplate(id: string, role: Role): Promise<void>;
  /** Re-insert a removed template (powers undo). */
  restoreTemplate(detail: TemplateDetail, role: Role): Promise<void>;

  addPhase(templateId: string, input: PhaseInput, role: Role): Promise<TemplateDetail>;
  updatePhase(phaseId: string, input: PhaseInput, role: Role): Promise<TemplateDetail>;
  removePhase(phaseId: string, role: Role): Promise<void>;
  restorePhase(templateId: string, phase: TemplatePhase, role: Role): Promise<void>;
  reorderPhases(templateId: string, orderedIds: string[], role: Role): Promise<void>;

  addTask(phaseId: string, input: TaskInput, role: Role): Promise<TemplateDetail>;
  updateTask(taskId: string, input: TaskInput, role: Role): Promise<TemplateDetail>;
  removeTask(taskId: string, role: Role): Promise<void>;
  restoreTask(phaseId: string, task: TemplateTask, role: Role): Promise<void>;
  reorderTasks(phaseId: string, orderedIds: string[], role: Role): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Backend mapping (GET/POST /projects/templates)
 * ------------------------------------------------------------------ */

/** Backend `ProjectTemplateResponse` (camelCased by the HTTP client). */
interface RawTemplate {
  id: string;
  name: string;
  description: string | null;
  expectedDuration: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Map a backend template row to the summary shape. Several fields are not
 * modelled by the backend and are defaulted (never fabricated).
 * INTEGRATION-GAP: type (no archetype field → "website"); active (not modelled
 * → true); phaseCount/taskCount/totalEstimateHours (list omits nested phases → 0).
 */
function toSummaryFromBackend(raw: RawTemplate): ProjectTemplate {
  return {
    id: raw.id,
    name: raw.name,
    type: "website",
    description: raw.description ?? "",
    active: true,
    expectedDurationDays: raw.expectedDuration ?? 0,
    phaseCount: 0,
    taskCount: 0,
    totalEstimateHours: 0,
    updatedAt: raw.updatedAt,
  };
}

function findTask(taskId: string): { record: TemplateRecord; phase: TemplatePhase; task: TemplateTask } {
  for (const record of records) {
    for (const phase of record.phases) {
      const task = phase.tasks.find((t) => t.id === taskId);
      if (task) return { record, phase, task };
    }
  }
  throw new TemplateError("not_found", `Unknown task: ${taskId}`);
}

export const templatesApi: TemplatesApi = {
  // WIRED — GET /projects/templates (bare array). See toSummaryFromBackend gaps.
  async list() {
    const rows = await http.get<RawTemplate[]>("/projects/templates");
    return rows
      .map(toSummaryFromBackend)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
  },

  // INTEGRATION-GAP: no backend endpoint — left on mock. There is no template
  // DETAIL route (GET /projects/templates/{id}) returning nested phases/tasks,
  // which #31's conversion wizard needs.
  async get(id) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const r = records.find((x) => x.id === id);
    return r ? toDetail(r) : null;
  },

  // WIRED — POST /projects/templates. `type`/`active` echo the input (the
  // backend does not persist them); phases are added separately (see addPhase).
  async createTemplate(input, role) {
    assertManage(role);
    const raw = await http.post<RawTemplate>("/projects/templates", {
      name: input.name,
      description: input.description,
      expectedDuration: input.expectedDurationDays,
      phases: [],
    });
    return {
      id: raw.id,
      name: raw.name,
      type: input.type,
      description: raw.description ?? input.description,
      active: input.active,
      expectedDurationDays: raw.expectedDuration ?? input.expectedDurationDays,
      phaseCount: 0,
      taskCount: 0,
      totalEstimateHours: 0,
      updatedAt: raw.updatedAt,
      phases: [],
    };
  },

  // INTEGRATION-GAP: no backend endpoint — left on mock (no template PATCH).
  async updateTemplate(id, input, role) {
    assertManage(role);
    await delay(MOCK_LATENCY_MS);
    const r = findRecord(id);
    r.name = input.name;
    r.type = input.type;
    r.description = input.description;
    r.active = input.active;
    r.expectedDurationDays = input.expectedDurationDays;
    touch(r);
    return toDetail(r);
  },

  // INTEGRATION-GAP: no backend endpoint — left on mock (no template DELETE).
  async deleteTemplate(id, role) {
    assertManage(role);
    await delay(MOCK_LATENCY_MS);
    records = records.filter((x) => x.id !== id);
  },

  // INTEGRATION-GAP: no backend endpoint — left on mock (undo helper).
  async restoreTemplate(detail, role) {
    assertManage(role);
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    if (records.some((x) => x.id === detail.id)) return;
    const record: TemplateRecord = {
      id: detail.id,
      name: detail.name,
      type: detail.type,
      description: detail.description,
      active: detail.active,
      expectedDurationDays: detail.expectedDurationDays,
      updatedAt: nowIso(),
      phases: detail.phases.map((p) => ({ ...p, tasks: [...p.tasks] })),
    };
    records = [...records, record];
  },

  // INTEGRATION-GAP: no backend endpoint — all phase/task editor mutations
  // (add/update/remove/restore/reorder) are left on mock; the backend has no
  // sub-resource routes for template phases or tasks.
  async addPhase(templateId, input, role) {
    assertManage(role);
    await delay(MOCK_LATENCY_MS);
    const r = findRecord(templateId);
    const phase: TemplatePhase = {
      id: rid(`${templateId}-ph`),
      templateId,
      name: input.name,
      order: r.phases.length,
      expectedDurationDays: input.expectedDurationDays,
      isMilestone: input.isMilestone,
      milestoneName: input.isMilestone ? input.milestoneName : null,
      tasks: [],
    };
    r.phases = [...r.phases, phase];
    touch(r);
    return toDetail(r);
  },

  async updatePhase(phaseId, input, role) {
    assertManage(role);
    await delay(MOCK_LATENCY_MS);
    const { record, phase } = findPhase(phaseId);
    phase.name = input.name;
    phase.expectedDurationDays = input.expectedDurationDays;
    phase.isMilestone = input.isMilestone;
    phase.milestoneName = input.isMilestone ? input.milestoneName : null;
    touch(record);
    return toDetail(record);
  },

  async removePhase(phaseId, role) {
    assertManage(role);
    await delay(MOCK_LATENCY_MS);
    const { record } = findPhase(phaseId);
    record.phases = record.phases
      .filter((p) => p.id !== phaseId)
      .map((p, i) => ({ ...p, order: i }));
    touch(record);
  },

  async restorePhase(templateId, phase, role) {
    assertManage(role);
    await delay(MOCK_LATENCY_MS / 2);
    const r = findRecord(templateId);
    if (r.phases.some((p) => p.id === phase.id)) return;
    const next = [...r.phases];
    const at = Math.min(phase.order, next.length);
    next.splice(at, 0, { ...phase, tasks: [...phase.tasks] });
    r.phases = next.map((p, i) => ({ ...p, order: i }));
    touch(r);
  },

  async reorderPhases(templateId, orderedIds, role) {
    assertManage(role);
    await delay(MOCK_LATENCY_MS / 2);
    const r = findRecord(templateId);
    const byId = new Map(r.phases.map((p) => [p.id, p]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((p): p is TemplatePhase => p != null)
      .map((p, i) => ({ ...p, order: i }));
    // Keep any phase not present in orderedIds appended (defensive).
    for (const p of r.phases) {
      if (!orderedIds.includes(p.id)) reordered.push({ ...p, order: reordered.length });
    }
    r.phases = reordered;
    touch(r);
  },

  async addTask(phaseId, input, role) {
    assertManage(role);
    await delay(MOCK_LATENCY_MS);
    const { record, phase } = findPhase(phaseId);
    const task: TemplateTask = {
      id: rid(`${phaseId}-t`),
      phaseId,
      title: input.title,
      roleResponsible: input.roleResponsible,
      estimateHours: input.estimateHours,
      order: phase.tasks.length,
    };
    phase.tasks = [...phase.tasks, task];
    touch(record);
    return toDetail(record);
  },

  async updateTask(taskId, input, role) {
    assertManage(role);
    await delay(MOCK_LATENCY_MS);
    const { record, task } = findTask(taskId);
    task.title = input.title;
    task.roleResponsible = input.roleResponsible;
    task.estimateHours = input.estimateHours;
    touch(record);
    return toDetail(record);
  },

  async removeTask(taskId, role) {
    assertManage(role);
    await delay(MOCK_LATENCY_MS);
    const { record, phase } = findTask(taskId);
    phase.tasks = phase.tasks
      .filter((t) => t.id !== taskId)
      .map((t, i) => ({ ...t, order: i }));
    touch(record);
  },

  async restoreTask(phaseId, task, role) {
    assertManage(role);
    await delay(MOCK_LATENCY_MS / 2);
    const { record, phase } = findPhase(phaseId);
    if (phase.tasks.some((t) => t.id === task.id)) return;
    const next = [...phase.tasks];
    const at = Math.min(task.order, next.length);
    next.splice(at, 0, { ...task });
    phase.tasks = next.map((t, i) => ({ ...t, order: i }));
    touch(record);
  },

  async reorderTasks(phaseId, orderedIds, role) {
    assertManage(role);
    await delay(MOCK_LATENCY_MS / 2);
    const { record, phase } = findPhase(phaseId);
    const byId = new Map(phase.tasks.map((t) => [t.id, t]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((t): t is TemplateTask => t != null)
      .map((t, i) => ({ ...t, order: i }));
    for (const t of phase.tasks) {
      if (!orderedIds.includes(t.id)) reordered.push({ ...t, order: reordered.length });
    }
    phase.tasks = reordered;
    touch(record);
  },
};
