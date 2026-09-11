/**
 * Project templates API client (F9, audit C10).
 *
 * WIRED to the real backend (`/projects/templates`). The backend does a
 * "replace-on-save" PATCH — sending `phases` replaces the whole phases/tasks
 * tree in one call (mirrors `proposal_template_service`'s established
 * pattern for exactly this "template with nested ordered children" shape).
 * Every granular phase/task mutation below (addPhase, reorderTasks, etc.) is
 * implemented as read-current-detail → mutate the array in memory → PATCH
 * the whole tree — there is one real persistence path, not eight sub-resource
 * endpoints, and every call is genuinely durable (survives reload, visible to
 * every user) where it used to be an in-session mock.
 *
 * `type`/`active` (template) and `isMilestone`/`milestoneName` (phase) are
 * NOT modelled by the backend — there was never a request to add them, and
 * they are cosmetic organizing fields, not something a business rule reads.
 * They are defaulted on every read (never fabricated as "saved") exactly as
 * they were before this file was wired to the backend.
 *
 * This is the CANONICAL template source. #31 (conversion wizard) and #42
 * (settings nav) import from here — do not duplicate the fixtures elsewhere.
 *
 * Mutations mirror the backend access rule (matrix §9): only Admin may write.
 * Reads are open to any caller (the route/UI gate to Admin+Gestor).
 */

import type { Role } from "@/lib/session";
import { http, HttpError } from "./http";
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
  type TemplateTaskRole,
} from "./template-types";

function assertManage(role: Role): void {
  if (!canManageTemplates(role)) {
    throw new TemplateError("forbidden", "Only an administrator can edit templates.");
  }
}

function mapError(err: unknown): never {
  if (err instanceof HttpError) {
    if (err.status === 404) throw new TemplateError("not_found", "Template not found.");
    if (err.status === 403) throw new TemplateError("forbidden", "Not allowed.");
  }
  throw err;
}

/* ------------------------------------------------------------------ *
 * Backend mapping (GET/POST/PATCH/DELETE /projects/templates)
 * ------------------------------------------------------------------ */

interface RawTask {
  id: string;
  title: string;
  orderIndex: number;
  roleResponsible: string | null;
  estimateHours: number | null;
}

interface RawPhase {
  id: string;
  name: string;
  orderIndex: number;
  expectedDuration: number | null;
  tasks: RawTask[];
}

interface RawTemplate {
  id: string;
  name: string;
  description: string | null;
  expectedDuration: number | null;
  phases: RawPhase[];
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_ROLE: TemplateTaskRole = "developer";

function taskFromBackend(raw: RawTask, phaseId: string): TemplateTask {
  return {
    id: raw.id,
    phaseId,
    title: raw.title,
    roleResponsible: (raw.roleResponsible as TemplateTaskRole | null) ?? DEFAULT_ROLE,
    estimateHours: raw.estimateHours ?? 0,
    order: raw.orderIndex,
  };
}

function phaseFromBackend(raw: RawPhase, templateId: string): TemplatePhase {
  return {
    id: raw.id,
    templateId,
    name: raw.name,
    order: raw.orderIndex,
    expectedDurationDays: raw.expectedDuration ?? 0,
    // INTEGRATION-GAP: isMilestone/milestoneName — not modelled by the backend.
    isMilestone: false,
    milestoneName: null,
    tasks: raw.tasks
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((t) => taskFromBackend(t, raw.id)),
  };
}

/**
 * `type`/`active` are frontend-only organizing fields with no backend column
 * — defaulted on every read, optionally overridden right after a create/
 * update call with the value the caller just submitted so the UI doesn't
 * visibly "forget" what was just typed within the same request/response.
 */
function toDetailFromBackend(
  raw: RawTemplate,
  overrides?: { type?: TemplateDetail["type"]; active?: boolean }
): TemplateDetail {
  const phases = raw.phases
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((p) => phaseFromBackend(p, raw.id));
  const summary = summarize(
    {
      id: raw.id,
      name: raw.name,
      type: overrides?.type ?? "website",
      description: raw.description ?? "",
      active: overrides?.active ?? true,
      expectedDurationDays: raw.expectedDuration ?? 0,
      updatedAt: raw.updatedAt,
    },
    phases
  );
  return { ...summary, phases };
}

function toSummaryFromBackend(raw: RawTemplate): ProjectTemplate {
  return toDetailFromBackend(raw);
}

/** Phase/task tree → the backend's nested create/update payload shape. */
function phasesToBackend(phases: TemplatePhase[]) {
  return phases
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((p, pi) => ({
      name: p.name,
      order_index: pi,
      expected_duration: p.expectedDurationDays || null,
      tasks: p.tasks
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((t, ti) => ({
          title: t.title,
          order_index: ti,
          role_responsible: t.roleResponsible,
          estimate_hours: t.estimateHours || null,
        })),
    }));
}

/** The one real mutation path every granular phase/task method below funnels
 * through: replace the whole phases tree via PATCH. */
async function replacePhases(
  templateId: string,
  phases: TemplatePhase[],
  overrides?: { type?: TemplateDetail["type"]; active?: boolean }
): Promise<TemplateDetail> {
  try {
    const raw = await http.patch<RawTemplate>(`/projects/templates/${templateId}`, {
      phases: phasesToBackend(phases),
    });
    return toDetailFromBackend(raw, overrides);
  } catch (err) {
    mapError(err);
  }
}

async function fetchDetail(id: string): Promise<TemplateDetail> {
  try {
    const raw = await http.get<RawTemplate>(`/projects/templates/${id}`);
    return toDetailFromBackend(raw);
  } catch (err) {
    mapError(err);
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

/** Locate a phase's parent template id by scanning a freshly fetched detail
 * list — the granular methods only receive a phaseId/taskId, not the owning
 * template id, so we resolve it via `list()` + `get()` once per call. */
async function findTemplateIdForPhase(phaseId: string): Promise<string> {
  const summaries = await templatesApi.list();
  for (const s of summaries) {
    const detail = await fetchDetail(s.id);
    if (detail.phases.some((p) => p.id === phaseId)) return s.id;
  }
  throw new TemplateError("not_found", `Unknown phase: ${phaseId}`);
}

async function findTemplateIdForTask(
  taskId: string
): Promise<{ templateId: string; phaseId: string }> {
  const summaries = await templatesApi.list();
  for (const s of summaries) {
    const detail = await fetchDetail(s.id);
    for (const phase of detail.phases) {
      if (phase.tasks.some((t) => t.id === taskId)) {
        return { templateId: s.id, phaseId: phase.id };
      }
    }
  }
  throw new TemplateError("not_found", `Unknown task: ${taskId}`);
}

export const templatesApi: TemplatesApi = {
  // WIRED — GET /projects/templates.
  async list() {
    try {
      const rows = await http.get<RawTemplate[]>("/projects/templates");
      return rows
        .map(toSummaryFromBackend)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
    } catch (err) {
      mapError(err);
    }
  },

  // WIRED — GET /projects/templates/{id}.
  async get(id) {
    try {
      return await fetchDetail(id);
    } catch (err) {
      if (err instanceof TemplateError && err.kind === "not_found") return null;
      throw err;
    }
  },

  // WIRED — POST /projects/templates (full nested payload in one call).
  async createTemplate(input, role) {
    assertManage(role);
    try {
      const raw = await http.post<RawTemplate>("/projects/templates", {
        name: input.name,
        description: input.description,
        expectedDuration: input.expectedDurationDays || null,
        phases: [],
      });
      return toDetailFromBackend(raw, { type: input.type, active: input.active });
    } catch (err) {
      mapError(err);
    }
  },

  // WIRED — PATCH /projects/templates/{id}.
  async updateTemplate(id, input, role) {
    assertManage(role);
    try {
      const raw = await http.patch<RawTemplate>(`/projects/templates/${id}`, {
        name: input.name,
        description: input.description,
        expected_duration: input.expectedDurationDays || null,
      });
      return toDetailFromBackend(raw, { type: input.type, active: input.active });
    } catch (err) {
      mapError(err);
    }
  },

  // WIRED — DELETE /projects/templates/{id}. Real delete (templates are
  // canonical config, not a BR-060 soft-delete entity).
  async deleteTemplate(id, role) {
    assertManage(role);
    try {
      await http.delete(`/projects/templates/${id}`);
    } catch (err) {
      mapError(err);
    }
  },

  // WIRED — undo re-creates the template with the same name/phases (a new id
  // is assigned; the backend has no "restore a specific id" concept since
  // delete is a real delete, not a soft-delete).
  async restoreTemplate(detail, role) {
    assertManage(role);
    try {
      const raw = await http.post<RawTemplate>("/projects/templates", {
        name: detail.name,
        description: detail.description,
        expectedDuration: detail.expectedDurationDays || null,
        phases: phasesToBackend(detail.phases),
      });
      void raw;
    } catch (err) {
      mapError(err);
    }
  },

  async addPhase(templateId, input, role) {
    assertManage(role);
    const current = await fetchDetail(templateId);
    const phase: TemplatePhase = {
      id: `new-${current.phases.length}`,
      templateId,
      name: input.name,
      order: current.phases.length,
      expectedDurationDays: input.expectedDurationDays,
      isMilestone: input.isMilestone,
      milestoneName: input.isMilestone ? input.milestoneName : null,
      tasks: [],
    };
    return replacePhases(templateId, [...current.phases, phase], {
      type: current.type,
      active: current.active,
    });
  },

  async updatePhase(phaseId, input, role) {
    assertManage(role);
    const templateId = await findTemplateIdForPhase(phaseId);
    const current = await fetchDetail(templateId);
    const phases = current.phases.map((p) =>
      p.id === phaseId
        ? {
            ...p,
            name: input.name,
            expectedDurationDays: input.expectedDurationDays,
            isMilestone: input.isMilestone,
            milestoneName: input.isMilestone ? input.milestoneName : null,
          }
        : p
    );
    return replacePhases(templateId, phases, { type: current.type, active: current.active });
  },

  async removePhase(phaseId, role) {
    assertManage(role);
    const templateId = await findTemplateIdForPhase(phaseId);
    const current = await fetchDetail(templateId);
    await replacePhases(
      templateId,
      current.phases.filter((p) => p.id !== phaseId),
      { type: current.type, active: current.active }
    );
  },

  async restorePhase(templateId, phase, role) {
    assertManage(role);
    const current = await fetchDetail(templateId);
    if (current.phases.some((p) => p.id === phase.id)) return;
    const next = [...current.phases];
    next.splice(Math.min(phase.order, next.length), 0, phase);
    await replacePhases(templateId, next, { type: current.type, active: current.active });
  },

  async reorderPhases(templateId, orderedIds, role) {
    assertManage(role);
    const current = await fetchDetail(templateId);
    const byId = new Map(current.phases.map((p) => [p.id, p]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((p): p is TemplatePhase => p != null);
    for (const p of current.phases) {
      if (!orderedIds.includes(p.id)) reordered.push(p);
    }
    await replacePhases(templateId, reordered, { type: current.type, active: current.active });
  },

  async addTask(phaseId, input, role) {
    assertManage(role);
    const templateId = await findTemplateIdForPhase(phaseId);
    const current = await fetchDetail(templateId);
    const phases = current.phases.map((p) =>
      p.id === phaseId
        ? {
            ...p,
            tasks: [
              ...p.tasks,
              {
                id: `new-${p.tasks.length}`,
                phaseId,
                title: input.title,
                roleResponsible: input.roleResponsible,
                estimateHours: input.estimateHours,
                order: p.tasks.length,
              },
            ],
          }
        : p
    );
    return replacePhases(templateId, phases, { type: current.type, active: current.active });
  },

  async updateTask(taskId, input, role) {
    assertManage(role);
    const { templateId } = await findTemplateIdForTask(taskId);
    const current = await fetchDetail(templateId);
    const phases = current.phases.map((p) => ({
      ...p,
      tasks: p.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              title: input.title,
              roleResponsible: input.roleResponsible,
              estimateHours: input.estimateHours,
            }
          : t
      ),
    }));
    return replacePhases(templateId, phases, { type: current.type, active: current.active });
  },

  async removeTask(taskId, role) {
    assertManage(role);
    const { templateId } = await findTemplateIdForTask(taskId);
    const current = await fetchDetail(templateId);
    const phases = current.phases.map((p) => ({
      ...p,
      tasks: p.tasks.filter((t) => t.id !== taskId),
    }));
    await replacePhases(templateId, phases, { type: current.type, active: current.active });
  },

  async restoreTask(phaseId, task, role) {
    assertManage(role);
    const templateId = await findTemplateIdForPhase(phaseId);
    const current = await fetchDetail(templateId);
    const phases = current.phases.map((p) => {
      if (p.id !== phaseId) return p;
      if (p.tasks.some((t) => t.id === task.id)) return p;
      const next = [...p.tasks];
      next.splice(Math.min(task.order, next.length), 0, task);
      return { ...p, tasks: next };
    });
    await replacePhases(templateId, phases, { type: current.type, active: current.active });
  },

  async reorderTasks(phaseId, orderedIds, role) {
    assertManage(role);
    const templateId = await findTemplateIdForPhase(phaseId);
    const current = await fetchDetail(templateId);
    const phases = current.phases.map((p) => {
      if (p.id !== phaseId) return p;
      const byId = new Map(p.tasks.map((t) => [t.id, t]));
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((t): t is TemplateTask => t != null);
      for (const t of p.tasks) {
        if (!orderedIds.includes(t.id)) reordered.push(t);
      }
      return { ...p, tasks: reordered };
    });
    await replacePhases(templateId, phases, { type: current.type, active: current.active });
  },
};
