/**
 * Collaboration API client — REAL implementation (F16 / integration issue #44).
 *
 * Wires the comments + @mentions + activity-log surface to FastAPI:
 *  - directory      → GET  /users            (authors + @mention autocomplete)
 *  - comments       → GET  /comments?entity_type=&entity_id=
 *  - create/edit    → POST /comments · PATCH /comments/{id}
 *  - delete         → DELETE /comments/{id}
 *  - activity feed  → GET  /activity?entity_type=&entity_id=&limit=
 *
 * The comment endpoints serialize in camelCase (matching the `Comment` contract
 * field-for-field), so responses pass straight through. Authorship and the
 * author-only edit/delete rule (BR-064) are enforced server-side from the JWT;
 * the `authorId`/`requesterId` args are kept for signature compatibility.
 */

import { http } from "./http";
import {
  type ActivityAction,
  type ActivityLog,
  type Comment,
  type CollaborationEntityType,
  type CreateCommentInput,
  type DirectoryUser,
  type UpdateCommentInput,
} from "./collaboration-types";

/** Backend `UserDirectoryEntry` (camelCased). Email is null for a Membro. */
interface RawDirectoryUser {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

/** Backend `ActivityLogEntry` (camelCased). `before`/`after` are JSONB snapshots. */
interface RawActivityEntry {
  id: string;
  entityType: CollaborationEntityType;
  entityId: string;
  actor: DirectoryUser;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

/** Frontend activity actions with a dedicated icon + label. */
const KNOWN_ACTIONS = new Set<ActivityAction>([
  "created",
  "updated",
  "status_changed",
  "assigned",
  "commented",
  "attached",
  "archived",
  "restored",
]);

/**
 * Collapse the backend's open action vocabulary (blocked/cancelled/completed/
 * won/lost/sent/…) onto the frontend's fixed set so the feed always resolves an
 * icon + i18n label. Unmapped state transitions render as `status_changed`.
 */
function toActivityAction(action: string): ActivityAction {
  if (KNOWN_ACTIONS.has(action as ActivityAction)) return action as ActivityAction;
  if (action === "unarchived" || action === "restored") return "restored";
  if (action === "deleted") return "updated";
  return "status_changed";
}

function toActivityLog(e: RawActivityEntry): ActivityLog {
  return {
    id: e.id,
    entityType: e.entityType,
    entityId: e.entityId,
    actor: e.actor,
    action: toActivityAction(e.action),
    // INTEGRATION-GAP: field/before/after — the backend records raw JSONB
    // snapshots (dicts), not the frontend's flattened single-value strings and
    // has no per-field key column, so the diff line is omitted (never rendered
    // as a raw object).
    field: undefined,
    before: null,
    after: null,
    createdAt: e.createdAt,
  };
}

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

export const collaborationApi: CollaborationApi = {
  async listDirectory() {
    const data = await http.get<{ items: RawDirectoryUser[] }>("/users");
    return data.items.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email ?? "",
      avatarUrl: u.avatarUrl,
    }));
  },

  async listComments(entityType, entityId) {
    // Backend returns comments chronologically (oldest first) for the entity.
    return http.get<Comment[]>("/comments", {
      query: { entity_type: entityType, entity_id: entityId },
    });
  },

  async createComment(input) {
    // authorId comes from the token; attachments live in the attachments API.
    return http.post<Comment>("/comments", {
      entityType: input.entityType,
      entityId: input.entityId,
      body: input.body,
      mentions: [...new Set(input.mentions)],
    });
  },

  async updateComment(input) {
    // The backend enforces author-only edits (BR-064) from the JWT.
    return http.patch<Comment>(`/comments/${input.id}`, {
      body: input.body,
      mentions: [...new Set(input.mentions)],
    });
  },

  async deleteComment(id, requesterId) {
    void requesterId;
    await http.delete(`/comments/${id}`);
  },

  async restoreComment(comment) {
    // No restore endpoint (BR-064 audit): undo re-creates the comment. It gets a
    // fresh id/timestamps but the same body + mentions on the same entity.
    return http.post<Comment>("/comments", {
      entityType: comment.entityType,
      entityId: comment.entityId,
      body: comment.body,
      mentions: comment.mentions,
    });
  },

  async listActivity(entityType, entityId) {
    // Backend returns newest-first, capped by `limit`.
    const data = await http.get<{ items: RawActivityEntry[] }>("/activity", {
      query: { entity_type: entityType, entity_id: entityId, limit: 50 },
    });
    return data.items.map(toActivityLog);
  },
};
