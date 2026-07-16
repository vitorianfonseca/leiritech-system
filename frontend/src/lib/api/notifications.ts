/**
 * Notifications API client — MOCK implementation (F15).
 *
 * Backend is not wired yet. This module exports a typed `notificationsApi`
 * object whose methods return promises exactly as the real HTTP client will.
 * The integration agent replaces the bodies with real `fetch` calls to FastAPI
 * WITHOUT changing the signatures. UI code (via TanStack Query) depends only on
 * the `NotificationsApi` interface below.
 *
 * State lives in a module-level map so mark-read / archive persist for the
 * session. Notifications are seeded per dev user so switching the `aurea_role`
 * cookie shows a role-appropriate feed.
 *
 * Role scoping (enforced here as defence-in-depth; the backend is authoritative):
 *  - BR-008: financial notifications (`financial: true`) are never returned to a
 *    Membro.
 *  - BR-002: a Membro only ever receives own-scope notifications, so the Membro
 *    seed contains no cross-project / pipeline / workload items.
 */

import {
  NotificationError,
  type Notification,
  type NotificationSummary,
  type NotificationType,
  type NotificationCategory,
  type NotificationEntityType,
} from "./notifications-types";
import type { Role } from "@/lib/session";

const MOCK_LATENCY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/* ------------------------------------------------------------------ *
 * Type → category / financial / entity metadata
 * ------------------------------------------------------------------ */

interface TypeMeta {
  category: NotificationCategory;
  financial: boolean;
  entityType: NotificationEntityType;
}

const TYPE_META: Record<NotificationType, TypeMeta> = {
  task_overdue: { category: "task", financial: false, entityType: "task" },
  payment_overdue: { category: "payment", financial: true, entityType: "payment" },
  stale_opportunity: { category: "opportunity", financial: false, entityType: "opportunity" },
  proposal_expired: { category: "proposal", financial: false, entityType: "proposal" },
  health_downgrade: { category: "project", financial: false, entityType: "project" },
  milestone_due_soon: { category: "project", financial: false, entityType: "project" },
  phase_completion_suggested: { category: "project", financial: false, entityType: "project" },
  payment_due_soon: { category: "payment", financial: true, entityType: "payment" },
  workload_overallocated: { category: "workload", financial: false, entityType: "project" },
  meeting_reminder: { category: "meeting", financial: false, entityType: "meeting" },
  won_not_converted: { category: "opportunity", financial: false, entityType: "opportunity" },
  forgotten_timer: { category: "task", financial: false, entityType: "task" },
  task_assigned: { category: "task", financial: false, entityType: "task" },
  mention: { category: "mention", financial: false, entityType: "task" },
  comment: { category: "comment", financial: false, entityType: "task" },
  task_returned: { category: "task", financial: false, entityType: "task" },
  task_approved: { category: "task", financial: false, entityType: "task" },
  proposal_viewed: { category: "proposal", financial: false, entityType: "proposal" },
  proposal_decided: { category: "proposal", financial: false, entityType: "proposal" },
  invitation_accepted: { category: "system", financial: false, entityType: "invite" },
  project_member_added: { category: "project", financial: false, entityType: "project" },
  blocker_resolved: { category: "task", financial: false, entityType: "task" },
  payment_received: { category: "payment", financial: true, entityType: "payment" },
};

function hrefFor(entityType: NotificationEntityType, entityId: string): string {
  switch (entityType) {
    case "task":
      return `/tasks?task=${entityId}`;
    case "payment":
      return `/finance?milestone=${entityId}`;
    case "opportunity":
      return `/crm/opportunities/${entityId}`;
    case "proposal":
      return `/crm/proposals/${entityId}`;
    case "project":
      return `/projects/${entityId}`;
    case "meeting":
      return `/calendar?meeting=${entityId}`;
    case "member":
      return `/team`;
    case "invite":
      return `/settings/team`;
    default:
      return "/";
  }
}

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

interface SeedInput {
  userId: string;
  type: NotificationType;
  entityId: string;
  groupKey: string;
  body: string;
  minutesAgo: number;
  read?: boolean;
}

function build(seed: SeedInput): Notification {
  const meta = TYPE_META[seed.type];
  const created = new Date(Date.now() - seed.minutesAgo * 60_000).toISOString();
  return {
    id: uid("ntf"),
    userId: seed.userId,
    type: seed.type,
    category: meta.category,
    financial: meta.financial,
    entityType: meta.entityType,
    entityId: seed.entityId,
    href: hrefFor(meta.entityType, seed.entityId),
    body: seed.body,
    groupKey: seed.groupKey,
    createdAt: created,
    readAt: seed.read ? created : null,
    archivedAt: null,
  };
}

const store = new Map<string, Notification[]>();
let seeded = false;

function seed(): void {
  if (seeded) return;
  seeded = true;

  const ADMIN = "dev-admin";
  const GESTOR = "dev-gestor";
  const MEMBRO = "dev-membro";

  const seeds: SeedInput[] = [
    /* -------- Admin (Rita) — full mix incl. financial + pipeline -------- */
    {
      userId: ADMIN,
      type: "payment_overdue",
      entityId: "pm-14",
      groupKey: "project:p-3",
      body: "Marco de pagamento «Arranque — Portal ACME» (7.500 €) está vencido.",
      minutesAgo: 40,
    },
    {
      userId: ADMIN,
      type: "payment_due_soon",
      entityId: "pm-21",
      groupKey: "project:p-3",
      body: "Marco «Entrega Fase 2» previsto para 22/07/2026 (12.000 €).",
      minutesAgo: 55,
    },
    {
      userId: ADMIN,
      type: "task_overdue",
      entityId: "t-88",
      groupKey: "project:p-3",
      body: "Tarefa «Rever contrato de manutenção» está em atraso desde 14/07/2026.",
      minutesAgo: 90,
    },
    {
      userId: ADMIN,
      type: "health_downgrade",
      entityId: "p-7",
      groupKey: "project:p-7",
      body: "Saúde sugerida do projeto «Migração Beta» mudou para Em risco.",
      minutesAgo: 180,
    },
    {
      userId: ADMIN,
      type: "won_not_converted",
      entityId: "o-31",
      groupKey: "owner:dev-admin",
      body: "Oportunidade ganha «Contrato Delta» ainda não foi convertida em projeto.",
      minutesAgo: 300,
      read: true,
    },
    {
      userId: ADMIN,
      type: "invitation_accepted",
      entityId: "inv-9",
      groupKey: "system",
      body: "Tiago Lopes aceitou o convite.",
      minutesAgo: 1440,
      read: true,
    },

    /* -------- Gestor (Bruno) — delivery + own pipeline + granted payments -------- */
    {
      userId: GESTOR,
      type: "phase_completion_suggested",
      entityId: "p-3",
      groupKey: "project:p-3",
      body: "Todas as tarefas da fase «Descoberta» estão concluídas. Concluir a fase?",
      minutesAgo: 25,
    },
    {
      userId: GESTOR,
      type: "milestone_due_soon",
      entityId: "p-3",
      groupKey: "project:p-3",
      body: "Marco «Entrega Fase 2» vence em 3 dias.",
      minutesAgo: 30,
    },
    {
      userId: GESTOR,
      type: "task_overdue",
      entityId: "t-51",
      groupKey: "project:p-3",
      body: "Tarefa «Wireframes do dashboard» está em atraso desde 15/07/2026.",
      minutesAgo: 60,
    },
    {
      userId: GESTOR,
      type: "stale_opportunity",
      entityId: "o-18",
      groupKey: "owner:dev-gestor",
      body: "Oportunidade «Website Corporativo» sem atividade há 14 dias.",
      minutesAgo: 120,
    },
    {
      userId: GESTOR,
      type: "proposal_expired",
      entityId: "pr-4",
      groupKey: "owner:dev-gestor",
      body: "Proposta «Portal ACME v2» expirou em 15/07/2026.",
      minutesAgo: 240,
    },
    {
      userId: GESTOR,
      type: "proposal_viewed",
      entityId: "pr-9",
      groupKey: "proposal:pr-9",
      body: "A proposta «App Interna Zeta» foi visualizada.",
      minutesAgo: 200,
      read: true,
    },
    {
      userId: GESTOR,
      type: "workload_overallocated",
      entityId: "p-3",
      groupKey: "person:dev-membro",
      body: "Carla Nunes está sobrecarregada (128% da capacidade).",
      minutesAgo: 300,
      read: true,
    },
    {
      userId: GESTOR,
      type: "payment_due_soon",
      entityId: "pm-30",
      groupKey: "project:p-12",
      body: "Marco «Fecho — App Zeta» previsto para 25/07/2026 (9.000 €).",
      minutesAgo: 420,
      read: true,
    },

    /* -------- Membro (Carla) — own-scope only, NO financial (BR-002/008) -------- */
    {
      userId: MEMBRO,
      type: "task_assigned",
      entityId: "t-102",
      groupKey: "project:p-3",
      body: "Foi-lhe atribuída a tarefa «Implementar tabela de tarefas».",
      minutesAgo: 15,
    },
    {
      userId: MEMBRO,
      type: "mention",
      entityId: "t-51",
      groupKey: "thread:c-77",
      body: "Bruno Salgado mencionou-o(a) em «Wireframes do dashboard».",
      minutesAgo: 35,
    },
    {
      userId: MEMBRO,
      type: "comment",
      entityId: "t-102",
      groupKey: "task:t-102",
      body: "Novo comentário em «Implementar tabela de tarefas».",
      minutesAgo: 50,
    },
    {
      userId: MEMBRO,
      type: "task_returned",
      entityId: "t-90",
      groupKey: "project:p-3",
      body: "A tarefa «Corrigir estados vazios» foi devolvida com feedback.",
      minutesAgo: 120,
    },
    {
      userId: MEMBRO,
      type: "meeting_reminder",
      entityId: "m-5",
      groupKey: "meeting:m-5",
      body: "Reunião «Ponto semanal de equipa» começa em 15 min.",
      minutesAgo: 130,
      read: true,
    },
    {
      userId: MEMBRO,
      type: "project_member_added",
      entityId: "p-12",
      groupKey: "project:p-12",
      body: "Foi adicionado(a) ao projeto «App Interna Zeta».",
      minutesAgo: 1440,
      read: true,
    },
  ];

  for (const s of seeds) {
    const list = store.get(s.userId) ?? [];
    list.push(build(s));
    store.set(s.userId, list);
  }
}

/* ------------------------------------------------------------------ *
 * Role scoping + helpers
 * ------------------------------------------------------------------ */

/** Newest first — the feed leads with the most recent event. */
function byNewest(a: Notification, b: Notification): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * Returns the active (non-archived) notifications visible to `userId` in
 * `role`. Membro never sees financial notifications (BR-008).
 */
function visibleFor(userId: string, role: Role): Notification[] {
  const list = store.get(userId) ?? [];
  return list.filter((n) => {
    if (n.archivedAt) return false;
    if (role === "membro" && n.financial) return false; // BR-008 defence-in-depth
    return true;
  });
}

function locate(id: string): { userId: string; index: number } | null {
  for (const [userId, list] of store) {
    const index = list.findIndex((n) => n.id === id);
    if (index !== -1) return { userId, index };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Public interface
 * ------------------------------------------------------------------ */

export interface NotificationsApi {
  /** All active notifications for the user (role-scoped), newest first. */
  list(userId: string, role: Role): Promise<Notification[]>;
  /** Lightweight bell summary: unread count + a few recent items. */
  summary(userId: string, role: Role, limit?: number): Promise<NotificationSummary>;
  markRead(id: string): Promise<Notification>;
  /** Mark every active, visible notification for the user read. Returns the
   *  ids that were changed so the caller can offer undo. */
  markAllRead(userId: string, role: Role): Promise<string[]>;
  /** Undo helper for mark-all: restore the given notifications to unread. */
  markUnread(ids: string[]): Promise<void>;
  archive(id: string): Promise<Notification>;
  /** Undo helper for archive. */
  unarchive(id: string): Promise<Notification>;
}

export const notificationsApi: NotificationsApi = {
  async list(userId, role) {
    seed();
    await delay(MOCK_LATENCY_MS);
    return visibleFor(userId, role).slice().sort(byNewest);
  },

  async summary(userId, role, limit = 5) {
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    const visible = visibleFor(userId, role).slice().sort(byNewest);
    return {
      unreadCount: visible.filter((n) => !n.readAt).length,
      recent: visible.slice(0, limit),
    };
  },

  async markRead(id) {
    await delay(MOCK_LATENCY_MS / 2);
    const found = locate(id);
    if (!found) throw new NotificationError("not_found");
    const current = store.get(found.userId)![found.index];
    if (current.readAt) return current;
    const updated: Notification = { ...current, readAt: new Date().toISOString() };
    store.get(found.userId)![found.index] = updated;
    return updated;
  },

  async markAllRead(userId, role) {
    await delay(MOCK_LATENCY_MS);
    const now = new Date().toISOString();
    const changed: string[] = [];
    const list = store.get(userId) ?? [];
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.archivedAt || n.readAt) continue;
      if (role === "membro" && n.financial) continue; // never touch hidden items
      list[i] = { ...n, readAt: now };
      changed.push(n.id);
    }
    store.set(userId, list);
    return changed;
  },

  async markUnread(ids) {
    await delay(MOCK_LATENCY_MS / 2);
    const set = new Set(ids);
    for (const [userId, list] of store) {
      let touched = false;
      for (let i = 0; i < list.length; i++) {
        if (set.has(list[i].id)) {
          list[i] = { ...list[i], readAt: null };
          touched = true;
        }
      }
      if (touched) store.set(userId, list);
    }
  },

  async archive(id) {
    await delay(MOCK_LATENCY_MS / 2);
    const found = locate(id);
    if (!found) throw new NotificationError("not_found");
    const current = store.get(found.userId)![found.index];
    const updated: Notification = {
      ...current,
      archivedAt: new Date().toISOString(),
    };
    store.get(found.userId)![found.index] = updated;
    return updated;
  },

  async unarchive(id) {
    await delay(MOCK_LATENCY_MS / 2);
    const found = locate(id);
    if (!found) throw new NotificationError("not_found");
    const current = store.get(found.userId)![found.index];
    const updated: Notification = { ...current, archivedAt: null };
    store.get(found.userId)![found.index] = updated;
    return updated;
  },
};
