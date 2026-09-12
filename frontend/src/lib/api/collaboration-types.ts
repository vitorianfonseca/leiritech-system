/**
 * Shared API models for collaboration surfaces (F16): comments, @mentions and
 * the append-only activity log.
 *
 * The backend (FastAPI) does not exist yet. These types describe the contract
 * the integration agent will fulfil; feature code depends only on these shapes,
 * never on the mock implementation, so the impl can be swapped without touching
 * callers. These models are entity-agnostic — the same CommentThread /
 * ActivityFeed embed on companies, opportunities, projects and tasks, keyed by
 * `entityType` + `entityId`.
 */

/** Every collaboration record is attached to one of these entity kinds. */
export type CollaborationEntityType =
  | "company"
  | "opportunity"
  | "proposal"
  | "project"
  | "task";

/** Machine-readable error codes returned by the collaboration client. */
export type CollaborationErrorCode =
  | "not_found"
  | "forbidden"
  | "network";

/**
 * Typed error thrown by the collaboration client. The `code` maps to an i18n
 * key so the UI can render a localized, user-safe message.
 */
export class CollaborationError extends Error {
  readonly code: CollaborationErrorCode;
  constructor(code: CollaborationErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CollaborationError";
    this.code = code;
  }
}

/** A user that can author comments and be @mentioned. */
export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/** Mock attachment metadata. Real storage (upload/scan) is handled by F17. */
export interface CommentAttachment {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  /** Mock object URL — never fetched in the mock phase. */
  url: string;
}

/** A single comment on an entity. Edited when `updatedAt !== createdAt`. */
export interface Comment {
  id: string;
  entityType: CollaborationEntityType;
  entityId: string;
  author: DirectoryUser;
  body: string;
  /** IDs of mentioned directory users (drives notifications). */
  mentions: string[];
  attachments: CommentAttachment[];
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

/**
 * Append-only activity record (BR-064). Regular users can never edit or delete
 * these — the client exposes no mutation for them by design.
 */
export type ActivityAction =
  | "created"
  | "updated"
  | "status_changed"
  | "assigned"
  | "commented"
  | "attached"
  | "archived"
  | "restored";

export interface ActivityLog {
  id: string;
  entityType: CollaborationEntityType;
  entityId: string;
  actor: DirectoryUser;
  /** Collapsed onto the fixed set, for icons and the per-entity timeline. */
  action: ActivityAction;
  /**
   * The backend's own verb, verbatim — "opportunity.won", "payment.paid",
   * "task.blocked". `action` above flattens all of those to `status_changed`,
   * which is fine for choosing an icon and useless for writing a sentence.
   * Kept alongside so a feed can say what actually happened. Optional
   * because the seeded client-side fixtures predate it; consumers fall back
   * to `action`, which is always present.
   */
  rawAction?: string;
  /** i18n key suffix for the field affected (e.g. "status", "owner"). */
  field?: string;
  before?: string | null;
  after?: string | null;
  createdAt: string;
}

export interface CreateCommentInput {
  entityType: CollaborationEntityType;
  entityId: string;
  authorId: string;
  body: string;
  mentions: string[];
  /** Attachments without server-assigned ids. */
  attachments: Omit<CommentAttachment, "id">[];
}

export interface UpdateCommentInput {
  id: string;
  /** Used by the mock to enforce that only the author may edit (BR-064). */
  authorId: string;
  body: string;
  mentions: string[];
}
