/**
 * Collaboration API client — MOCK implementation (F16).
 *
 * Backend is not wired yet. This module exports a typed `collaborationApi`
 * object whose methods return promises exactly as the real HTTP client will.
 * The integration agent replaces the bodies with real `fetch` calls to FastAPI
 * WITHOUT changing the signatures. UI code (via TanStack Query) depends only on
 * the `CollaborationApi` interface below.
 *
 * State lives in module-level maps so comments/activity persist for the session
 * (add a comment, it stays until reload) — enough to exercise every flow. A
 * fixed demo entity (`project:demo`) is seeded so embedders can preview a
 * populated thread; any other entity id starts empty so the empty state is
 * reachable too.
 *
 * BR-064: activity logs are append-only. The client exposes NO update/delete
 * for them — regular users cannot mutate history.
 */

import {
  CollaborationError,
  type ActivityAction,
  type ActivityLog,
  type Comment,
  type CollaborationEntityType,
  type CreateCommentInput,
  type DirectoryUser,
  type UpdateCommentInput,
} from "./collaboration-types";

const MOCK_LATENCY_MS = 450;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function entityKey(type: CollaborationEntityType, id: string): string {
  return `${type}:${id}`;
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/* ------------------------------------------------------------------ *
 * Directory (users that can author + be mentioned)
 * ------------------------------------------------------------------ */

const DIRECTORY: DirectoryUser[] = [
  { id: "dev-admin", name: "Rita Andrade", email: "rita@aurea.pt", avatarUrl: null },
  { id: "dev-gestor", name: "Bruno Salgado", email: "bruno@aurea.pt", avatarUrl: null },
  { id: "dev-membro", name: "Carla Nunes", email: "carla@aurea.pt", avatarUrl: null },
  { id: "u-diogo", name: "Diogo Ferreira", email: "diogo@aurea.pt", avatarUrl: null },
  { id: "u-ines", name: "Inês Marques", email: "ines@aurea.pt", avatarUrl: null },
  { id: "u-tiago", name: "Tiago Lopes", email: "tiago@aurea.pt", avatarUrl: null },
];

function findUser(id: string): DirectoryUser {
  return (
    DIRECTORY.find((u) => u.id === id) ?? {
      id,
      name: id,
      email: "",
      avatarUrl: null,
    }
  );
}

/* ------------------------------------------------------------------ *
 * In-memory stores
 * ------------------------------------------------------------------ */

const comments = new Map<string, Comment[]>();
const activity = new Map<string, ActivityLog[]>();

function pushActivity(
  entityType: CollaborationEntityType,
  entityId: string,
  actor: DirectoryUser,
  action: ActivityAction,
  extra?: Partial<Pick<ActivityLog, "field" | "before" | "after">>,
  at?: string
): void {
  const key = entityKey(entityType, entityId);
  const list = activity.get(key) ?? [];
  list.push({
    id: uid("act"),
    entityType,
    entityId,
    actor,
    action,
    field: extra?.field,
    before: extra?.before ?? null,
    after: extra?.after ?? null,
    createdAt: at ?? new Date().toISOString(),
  });
  activity.set(key, list);
}

/**
 * Mock mention notification. In production this fans out to the notifications
 * service (issue #39). Here it just records intent — kept as a hook so the
 * integration agent has a clear seam to replace.
 */
function notifyMentions(comment: Comment): void {
  for (const userId of comment.mentions) {
    console.info(
      `[mock notification] @${findUser(userId).name} mentioned in ` +
        `${comment.entityType}:${comment.entityId} by ${comment.author.name}`
    );
  }
}

/* ------------------------------------------------------------------ *
 * Seed a demo entity so embedders can preview a populated thread
 * ------------------------------------------------------------------ */

let seeded = false;
function seed(): void {
  if (seeded) return;
  seeded = true;

  const type: CollaborationEntityType = "project";
  const id = "demo";
  const key = entityKey(type, id);
  const now = Date.now();
  const iso = (minutesAgo: number) =>
    new Date(now - minutesAgo * 60_000).toISOString();

  const rita = findUser("dev-admin");
  const bruno = findUser("dev-gestor");

  comments.set(key, [
    {
      id: uid("cmt"),
      entityType: type,
      entityId: id,
      author: bruno,
      body: "Proposta enviada ao cliente. @Rita Andrade podes rever os marcos de pagamento?",
      mentions: ["dev-admin"],
      attachments: [
        {
          id: uid("att"),
          name: "proposta-v2.pdf",
          sizeBytes: 248_320,
          mimeType: "application/pdf",
          url: "#",
        },
      ],
      createdAt: iso(180),
      updatedAt: iso(180),
    },
    {
      id: uid("cmt"),
      entityType: type,
      entityId: id,
      author: rita,
      body: "Revisto. Ajustei o segundo marco para 40%. @Carla Nunes fica ao teu cuidado o arranque.",
      mentions: ["dev-membro"],
      attachments: [],
      createdAt: iso(95),
      updatedAt: iso(60),
    },
  ]);

  activity.set(key, []);
  pushActivity(type, id, rita, "created", undefined, iso(300));
  pushActivity(type, id, rita, "assigned", { field: "owner", after: "Bruno Salgado" }, iso(240));
  pushActivity(type, id, bruno, "commented", undefined, iso(180));
  pushActivity(
    type,
    id,
    rita,
    "status_changed",
    { field: "status", before: "Rascunho", after: "Em curso" },
    iso(120)
  );
  pushActivity(type, id, rita, "commented", undefined, iso(95));
  pushActivity(type, id, bruno, "attached", { field: "attachment", after: "proposta-v2.pdf" }, iso(180));
}

/* ------------------------------------------------------------------ *
 * Public interface
 * ------------------------------------------------------------------ */

export interface CollaborationApi {
  /** Directory of users available for @mention autocomplete. */
  listDirectory(): Promise<DirectoryUser[]>;
  listComments(
    entityType: CollaborationEntityType,
    entityId: string
  ): Promise<Comment[]>;
  createComment(input: CreateCommentInput): Promise<Comment>;
  updateComment(input: UpdateCommentInput): Promise<Comment>;
  deleteComment(id: string, requesterId: string): Promise<void>;
  /** Re-insert a deleted comment (powers the undo affordance). */
  restoreComment(comment: Comment): Promise<Comment>;
  listActivity(
    entityType: CollaborationEntityType,
    entityId: string
  ): Promise<ActivityLog[]>;
}

function locateComment(id: string): { key: string; index: number } | null {
  for (const [key, list] of comments) {
    const index = list.findIndex((c) => c.id === id);
    if (index !== -1) return { key, index };
  }
  return null;
}

export const collaborationApi: CollaborationApi = {
  async listDirectory() {
    await delay(MOCK_LATENCY_MS / 2);
    return [...DIRECTORY];
  },

  async listComments(entityType, entityId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const list = comments.get(entityKey(entityType, entityId)) ?? [];
    // Chronological (oldest first) — a thread reads top to bottom.
    return list
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async createComment(input) {
    await delay(MOCK_LATENCY_MS);
    const key = entityKey(input.entityType, input.entityId);
    const nowIso = new Date().toISOString();
    const author = findUser(input.authorId);
    const comment: Comment = {
      id: uid("cmt"),
      entityType: input.entityType,
      entityId: input.entityId,
      author,
      body: input.body,
      mentions: [...new Set(input.mentions)],
      attachments: input.attachments.map((a) => ({ ...a, id: uid("att") })),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const list = comments.get(key) ?? [];
    list.push(comment);
    comments.set(key, list);

    pushActivity(input.entityType, input.entityId, author, "commented");
    if (comment.attachments.length > 0) {
      pushActivity(input.entityType, input.entityId, author, "attached", {
        field: "attachment",
        after: comment.attachments[0].name,
      });
    }
    notifyMentions(comment);
    return comment;
  },

  async updateComment(input) {
    await delay(MOCK_LATENCY_MS);
    const found = locateComment(input.id);
    if (!found) throw new CollaborationError("not_found");
    const current = comments.get(found.key)![found.index];
    // Only the author may edit their own comment (BR-064).
    if (current.author.id !== input.authorId) {
      throw new CollaborationError("forbidden");
    }
    const updated: Comment = {
      ...current,
      body: input.body,
      mentions: [...new Set(input.mentions)],
      updatedAt: new Date().toISOString(),
    };
    comments.get(found.key)![found.index] = updated;

    pushActivity(current.entityType, current.entityId, current.author, "updated", {
      field: "comment",
    });
    notifyMentions(updated);
    return updated;
  },

  async deleteComment(id, requesterId) {
    await delay(MOCK_LATENCY_MS);
    const found = locateComment(id);
    if (!found) throw new CollaborationError("not_found");
    const list = comments.get(found.key)!;
    const current = list[found.index];
    // Only the author may delete their own comment (BR-064).
    if (current.author.id !== requesterId) {
      throw new CollaborationError("forbidden");
    }
    list.splice(found.index, 1);
    comments.set(found.key, list);
  },

  async restoreComment(comment) {
    await delay(MOCK_LATENCY_MS / 2);
    const key = entityKey(comment.entityType, comment.entityId);
    const list = comments.get(key) ?? [];
    if (!list.some((c) => c.id === comment.id)) {
      list.push(comment);
      comments.set(key, list);
    }
    return comment;
  },

  async listActivity(entityType, entityId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const list = activity.get(entityKey(entityType, entityId)) ?? [];
    // Newest first — the feed leads with the most recent event.
    return list
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};
