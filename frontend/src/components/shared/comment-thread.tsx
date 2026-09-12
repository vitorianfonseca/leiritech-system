"use client";

import * as React from "react";
import { useTranslations, useFormatter, useNow } from "next-intl";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  MessageSquare,
  Paperclip,
  Send,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
  FileText,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "./empty-state";
import { SkeletonList } from "./skeletons";
import { ConfirmDialog } from "./confirm-dialog";
import { toast, toastWithUndo } from "./toast";
import { MentionInput, deriveMentionIds } from "./mention-input";
import {
  collaborationApi,
  type CollaborationApi,
} from "@/lib/api/collaboration";
import {
  CollaborationError,
  type CollaborationEntityType,
  type Comment,
  type CommentAttachment,
  type DirectoryUser,
} from "@/lib/api/collaboration-types";

export interface CommentThreadCurrentUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface CommentThreadProps {
  entityType: CollaborationEntityType;
  entityId: string;
  /**
   * The signed-in user. Required to compose, and gates edit/delete to the
   * author's own comments (BR-064). Omit to render the thread read-only.
   */
  currentUser?: CommentThreadCurrentUser;
  /** Injectable for tests; defaults to the mock client. */
  api?: CollaborationApi;
  className?: string;
}

type PendingAttachment = Omit<CommentAttachment, "id">;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function UserAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

/** Renders a comment body with known @mentions visually highlighted. */
function MentionText({
  body,
  users,
}: {
  body: string;
  users: DirectoryUser[];
}) {
  const mentioned = users.filter((u) => body.includes(`@${u.name}`));
  if (mentioned.length === 0) {
    return <span className="whitespace-pre-wrap break-words">{body}</span>;
  }
  // Split on the mention tokens, longest names first to avoid prefix clashes.
  const names = mentioned
    .map((u) => u.name)
    .sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`,
    "g"
  );
  const parts = body.split(pattern);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        part.startsWith("@") && names.includes(part.slice(1)) ? (
          <span
            key={i}
            className="rounded bg-signal-muted px-1 font-medium text-signal"
          >
            {part}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </span>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove?: () => void;
}) {
  const t = useTranslations("collaboration");
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-muted/40 py-1 pl-2 pr-1 text-xs">
      <FileText className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
      <span className="truncate font-medium">{attachment.name}</span>
      <span className="shrink-0 text-muted-foreground">
        {formatBytes(attachment.sizeBytes)}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("attachments.remove", { name: attachment.name })}
          className="ml-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Composer (used for new comments and inline edits)
 * ------------------------------------------------------------------ */

function CommentComposer({
  users,
  currentUser,
  pending,
  initialValue = "",
  initialAttachments = [],
  allowAttachments = true,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  users: DirectoryUser[];
  currentUser: CommentThreadCurrentUser;
  pending: boolean;
  initialValue?: string;
  initialAttachments?: PendingAttachment[];
  allowAttachments?: boolean;
  submitLabel: string;
  onSubmit: (body: string, mentions: string[], attachments: PendingAttachment[]) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("collaboration");
  const [body, setBody] = React.useState(initialValue);
  const [attachments, setAttachments] =
    React.useState<PendingAttachment[]>(initialAttachments);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const fieldId = React.useId();

  const canSubmit = body.trim().length > 0 && !pending;

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const next: PendingAttachment[] = Array.from(files).map((f) => ({
      name: f.name,
      sizeBytes: f.size,
      mimeType: f.type || "application/octet-stream",
      // Mock URL — real upload is handled by F17.
      url: "#",
    }));
    setAttachments((prev) => [...prev, ...next]);
  }

  function submit() {
    if (!canSubmit) return;
    onSubmit(body.trim(), deriveMentionIds(body, users), attachments);
    setBody("");
    setAttachments([]);
  }

  return (
    <div className="flex gap-3">
      <UserAvatar
        name={currentUser.name}
        avatarUrl={currentUser.avatarUrl}
        className="mt-0.5 hidden sm:flex"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <label htmlFor={fieldId} className="sr-only">
          {t("composer.label")}
        </label>
        <MentionInputAutoFocus autoFocus={autoFocus}>
          <MentionInput
            id={fieldId}
            value={body}
            onValueChange={setBody}
            users={users}
            placeholder={t("composer.placeholder")}
            disabled={pending}
            onSubmit={submit}
          />
        </MentionInputAutoFocus>

        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((att, i) => (
              <AttachmentChip
                key={`${att.name}-${i}`}
                attachment={att}
                onRemove={
                  pending
                    ? undefined
                    : () =>
                        setAttachments((prev) => prev.filter((_, j) => j !== i))
                }
              />
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {allowAttachments ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip strokeWidth={1.8} aria-hidden />
                  {t("composer.attach")}
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("composer.hint")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onCancel ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={onCancel}
              >
                {t("actions.cancel")}
              </Button>
            ) : null}
            <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>
              {pending ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Send strokeWidth={1.8} aria-hidden />
              )}
              {submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Focuses the first focusable child on mount (used for inline edit). */
function MentionInputAutoFocus({
  autoFocus,
  children,
}: {
  autoFocus?: boolean;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current?.querySelector("textarea");
    el?.focus();
    // Place caret at the end.
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);
  return <div ref={ref}>{children}</div>;
}

/* ------------------------------------------------------------------ *
 * Single comment
 * ------------------------------------------------------------------ */

function CommentItem({
  comment,
  users,
  currentUser,
  editing,
  editPending,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  comment: Comment;
  users: DirectoryUser[];
  currentUser?: CommentThreadCurrentUser;
  editing: boolean;
  editPending: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (body: string, mentions: string[]) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("collaboration");
  const format = useFormatter();
  const now = useNow();
  const isOwn = currentUser?.id === comment.author.id;
  const edited = comment.updatedAt !== comment.createdAt;
  const created = new Date(comment.createdAt);

  return (
    <article className="flex gap-3">
      <UserAvatar
        name={comment.author.name}
        avatarUrl={comment.author.avatarUrl}
        className="mt-0.5 size-9 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {comment.author.name}
          </span>
          <time
            dateTime={comment.createdAt}
            title={format.dateTime(created, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            className="shrink-0 text-xs text-muted-foreground"
          >
            {format.relativeTime(created, now)}
          </time>
          {edited ? (
            <Badge variant="outline" className="shrink-0">
              {t("comment.edited")}
            </Badge>
          ) : null}
          {isOwn && !editing ? (
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t("comment.actionsLabel")}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 aria-expanded:bg-muted"
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.8} aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={onStartEdit}>
                    <Pencil aria-hidden />
                    {t("actions.edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <Trash2 aria-hidden />
                    {t("actions.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>

        {editing ? (
          <div className="mt-2">
            <InlineEditComposer
              users={users}
              initialValue={comment.body}
              pending={editPending}
              onCancel={onCancelEdit}
              onSave={onSaveEdit}
            />
          </div>
        ) : (
          <>
            <div className="mt-1 text-sm text-foreground">
              <MentionText body={comment.body} users={users} />
            </div>
            {comment.attachments.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {comment.attachments.map((att) => (
                  <AttachmentChip key={att.id} attachment={att} />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

function InlineEditComposer({
  users,
  initialValue,
  pending,
  onCancel,
  onSave,
}: {
  users: DirectoryUser[];
  initialValue: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (body: string, mentions: string[]) => void;
}) {
  const t = useTranslations("collaboration");
  const [body, setBody] = React.useState(initialValue);
  const canSave = body.trim().length > 0 && !pending;

  return (
    <div className="space-y-2">
      <MentionInputAutoFocus autoFocus>
        <MentionInput
          value={body}
          onValueChange={setBody}
          users={users}
          disabled={pending}
          minRows={2}
          onSubmit={() =>
            canSave && onSave(body.trim(), deriveMentionIds(body, users))
          }
        />
      </MentionInputAutoFocus>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
          {t("actions.cancel")}
        </Button>
        <Button
          size="sm"
          disabled={!canSave}
          onClick={() => onSave(body.trim(), deriveMentionIds(body, users))}
        >
          {pending ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
          ) : null}
          {t("actions.save")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Thread
 * ------------------------------------------------------------------ */

/**
 * Reusable comment thread, keyed by `entityType` + `entityId`. Embed on any
 * entity (companies, opportunities, projects, tasks). Compose box supports
 * @mention autocomplete and mock attachments; mentions trigger a notification
 * (mock → #39). Authors can edit/delete their own comments with an edited
 * indicator and undo-on-delete (BR-064). Handles loading / empty / error.
 */
export function CommentThread({
  entityType,
  entityId,
  currentUser,
  api = collaborationApi,
  className,
}: CommentThreadProps) {
  const t = useTranslations("collaboration");
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Comment | null>(null);

  const commentsKey = ["collaboration", "comments", entityType, entityId] as const;
  const activityKey = ["collaboration", "activity", entityType, entityId] as const;

  const directoryQuery = useQuery({
    queryKey: ["collaboration", "directory"],
    queryFn: () => api.listDirectory(),
    staleTime: 5 * 60 * 1000,
  });

  const commentsQuery = useQuery({
    queryKey: commentsKey,
    queryFn: () => api.listComments(entityType, entityId),
  });

  const users = directoryQuery.data ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: commentsKey });
    queryClient.invalidateQueries({ queryKey: activityKey });
  }

  function messageForError(error: unknown): string {
    if (error instanceof CollaborationError) {
      return t(`errors.${error.code}`);
    }
    return t("errors.generic");
  }

  const createMutation = useMutation({
    mutationFn: (vars: {
      body: string;
      mentions: string[];
      attachments: PendingAttachment[];
    }) =>
      api.createComment({
        entityType,
        entityId,
        authorId: currentUser!.id,
        body: vars.body,
        mentions: vars.mentions,
        attachments: vars.attachments,
      }),
    onSuccess: (comment) => {
      invalidate();
      toast({ tone: "success", title: t("toast.created") });
      if (comment.mentions.length > 0) {
        toast({
          tone: "info",
          title: t("toast.mentioned", { count: comment.mentions.length }),
        });
      }
    },
    onError: (error) =>
      toast({ tone: "destructive", title: messageForError(error) }),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; body: string; mentions: string[] }) =>
      api.updateComment({
        id: vars.id,
        authorId: currentUser!.id,
        body: vars.body,
        mentions: vars.mentions,
      }),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
      toast({ tone: "success", title: t("toast.updated") });
    },
    onError: (error) =>
      toast({ tone: "destructive", title: messageForError(error) }),
  });

  const deleteMutation = useMutation({
    mutationFn: (comment: Comment) =>
      api.deleteComment(comment.id, currentUser!.id),
    onSuccess: (_data, comment) => {
      invalidate();
      toastWithUndo({
        tone: "default",
        title: t("toast.deleted"),
        onUndo: async () => {
          await api.restoreComment(comment);
          invalidate();
        },
      });
    },
    onError: (error) =>
      toast({ tone: "destructive", title: messageForError(error) }),
  });

  const comments = commentsQuery.data ?? [];

  return (
    <section className={cn("space-y-5", className)} aria-label={t("title")}>
      <header className="flex items-center gap-2">
        <MessageSquare className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
        <h2 className="font-heading text-sm font-semibold text-foreground">
          {t("title")}
        </h2>
        {comments.length > 0 ? (
          <Badge variant="default">{comments.length}</Badge>
        ) : null}
      </header>

      {currentUser ? (
        <CommentComposer
          users={users}
          currentUser={currentUser}
          pending={createMutation.isPending}
          submitLabel={t("composer.submit")}
          onSubmit={(body, mentions, attachments) =>
            createMutation.mutate({ body, mentions, attachments })
          }
        />
      ) : null}

      {commentsQuery.isPending ? (
        <SkeletonList rows={3} />
      ) : commentsQuery.isError ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive-muted/40 px-6 py-8 text-center"
        >
          <AlertTriangle className="size-6 text-destructive" strokeWidth={1.8} aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {t("errors.loadTitle")}
            </p>
            <p className="text-sm text-muted-foreground">{t("errors.loadBody")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => commentsQuery.refetch()}>
            {t("actions.retry")}
          </Button>
        </div>
      ) : comments.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={t("empty.title")}
          description={t("empty.description")}
        />
      ) : (
        <div className="space-y-6">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              users={users}
              currentUser={currentUser}
              editing={editingId === comment.id}
              editPending={updateMutation.isPending && editingId === comment.id}
              onStartEdit={() => setEditingId(comment.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(body, mentions) =>
                updateMutation.mutate({ id: comment.id, body, mentions })
              }
              onDelete={() => setDeleteTarget(comment)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        variant="destructive"
        title={t("delete.title")}
        description={t("delete.description")}
        confirmLabel={t("actions.delete")}
        onConfirm={async () => {
          if (deleteTarget) await deleteMutation.mutateAsync(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </section>
  );
}
