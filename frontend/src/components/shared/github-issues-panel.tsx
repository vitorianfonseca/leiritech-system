"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bug,
  CircleDot,
  CircleCheck,
  ExternalLink,
  RefreshCw,
  MessageSquare,
  Send,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "./toast";
import {
  githubApi,
  GithubIntegrationError,
  type GithubAssignee,
  type GithubIssueLink,
  type GithubLabel,
} from "@/lib/api/github";

const TEXTAREA_CLASS =
  "flex w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

/** Readable text colour (black/white) for a GitHub label's hex background —
 * mirrors GitHub's own YIQ-brightness heuristic so chips stay legible for
 * any colour an Admin picks. */
function labelTextColor(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#1b1f23" : "#ffffff";
}

function LabelChip({ label }: { label: GithubLabel }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium leading-none"
      style={{ backgroundColor: `#${label.color}`, color: labelTextColor(label.color) }}
      title={label.description ?? undefined}
    >
      {label.name}
    </span>
  );
}

export interface GithubIssuesPanelProps {
  /** What this panel's issues are filed about — a project, an audit finding,
   * or any other addressable entity. Scopes both the list and every issue
   * created from here. */
  entityType: string;
  entityId: string;
  /** May the current user file/edit an issue from here (matrix-style write
   * gate — Gestor+, mirrored from the backend's RequireGestor)? */
  canCreate: boolean;
  /** Pre-filled into the create dialog (e.g. "Bug: <project name> — "). */
  titlePrefix?: string;
  /** Overrides the backend's default repo (e.g. a client's own repo). */
  repo?: string;
  /** Pre-checked in the create dialog's label picker. */
  defaultLabels?: string[];
}

/**
 * Reusable "GitHub issues filed about this" panel — filterable list of
 * already-linked issues (coloured labels, assignee avatars, close/reopen,
 * inline comment thread) plus a create-issue dialog with a label/assignee
 * picker. Used both on a Project's detail page and in the internal
 * audit-findings area, so every issue filed anywhere in the app goes through
 * the same real GitHub-backed path.
 */
export function GithubIssuesPanel({
  entityType,
  entityId,
  canCreate,
  titlePrefix = "",
  repo,
  defaultLabels = [],
}: GithubIssuesPanelProps) {
  const t = useTranslations("shared.githubIssues");
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [title, setTitle] = React.useState(titlePrefix);
  const [body, setBody] = React.useState("");
  const [pickedLabels, setPickedLabels] = React.useState<string[]>(defaultLabels);
  const [pickedAssignee, setPickedAssignee] = React.useState("");
  const [stateFilter, setStateFilter] = React.useState<"all" | "open" | "closed">("open");
  const [labelFilter, setLabelFilter] = React.useState("");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const queryKey = ["github-issues", entityType, entityId, stateFilter, labelFilter] as const;
  const query = useQuery({
    queryKey,
    queryFn: () =>
      githubApi.listIssues(entityType, entityId, {
        state: stateFilter,
        label: labelFilter || undefined,
      }),
  });

  const labelsQuery = useQuery({
    queryKey: ["github-labels", repo],
    queryFn: () => githubApi.listLabels(repo),
    enabled: createOpen,
    staleTime: 5 * 60 * 1000,
  });
  const collaboratorsQuery = useQuery({
    queryKey: ["github-collaborators", repo],
    queryFn: () => githubApi.listCollaborators(repo),
    enabled: createOpen,
    staleTime: 5 * 60 * 1000,
  });

  function invalidateList() {
    queryClient.invalidateQueries({ queryKey: ["github-issues", entityType, entityId] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      githubApi.createIssue({
        entityType,
        entityId,
        title: title.trim(),
        body,
        repo,
        labels: pickedLabels,
        assignees: pickedAssignee ? [pickedAssignee] : [],
      }),
    onSuccess: (link) => {
      invalidateList();
      toast({ tone: "success", title: t("createdToast", { number: link.issueNumber }) });
      setCreateOpen(false);
      setTitle(titlePrefix);
      setBody("");
      setPickedLabels(defaultLabels);
      setPickedAssignee("");
    },
    onError: (err) => {
      const message =
        err instanceof GithubIntegrationError ? err.message : t("createFailedGeneric");
      toast({ tone: "destructive", title: t("createFailedToast"), description: message });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: (linkId: string) => githubApi.refreshIssue(linkId),
    onSuccess: invalidateList,
    onError: () => toast({ tone: "destructive", title: t("refreshFailedToast") }),
  });

  const toggleStateMutation = useMutation({
    mutationFn: (issue: GithubIssueLink) =>
      githubApi.updateIssue(issue.id, { state: issue.state === "open" ? "closed" : "open" }),
    onSuccess: (updated) => {
      invalidateList();
      toast({
        tone: "success",
        title: t(updated.state === "closed" ? "closedToast" : "reopenedToast", {
          number: updated.issueNumber,
        }),
      });
    },
    onError: () => toast({ tone: "destructive", title: t("stateChangeFailedToast") }),
  });

  const issues = query.data ?? [];
  const availableLabels = labelsQuery.data ?? [];
  const collaborators = collaboratorsQuery.data ?? [];

  function toggleLabel(name: string) {
    setPickedLabels((prev) =>
      prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name]
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canCreate ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Bug aria-hidden />
            {t("createButton")}
          </Button>
        ) : null}
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          aria-label={t("filters.state")}
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}
          className="h-8 rounded-lg border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <option value="open">{t("filters.stateOpen")}</option>
          <option value="closed">{t("filters.stateClosed")}</option>
          <option value="all">{t("filters.stateAll")}</option>
        </select>
        <Input
          value={labelFilter}
          onChange={(e) => setLabelFilter(e.target.value)}
          placeholder={t("filters.labelPlaceholder")}
          className="h-8 w-40"
          aria-label={t("filters.label")}
        />
      </div>

      <div className="mt-4 space-y-2">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              canManage={canCreate}
              expanded={expandedId === issue.id}
              onToggleExpand={() => setExpandedId((cur) => (cur === issue.id ? null : issue.id))}
              onRefresh={() => refreshMutation.mutate(issue.id)}
              onToggleState={() => toggleStateMutation.mutate(issue)}
              refreshPending={refreshMutation.isPending}
              statePending={toggleStateMutation.isPending}
              t={t}
            />
          ))
        )}
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(next) => (!createMutation.isPending ? setCreateOpen(next) : null)}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto p-6">
          <div className="space-y-1.5">
            <DialogTitle>{t("dialog.title")}</DialogTitle>
            <DialogDescription>{t("dialog.description")}</DialogDescription>
          </div>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              createMutation.mutate();
            }}
            className="mt-5 flex flex-col gap-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="gh-issue-title">{t("dialog.fields.title")}</Label>
              <Input
                id="gh-issue-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gh-issue-body">{t("dialog.fields.body")}</Label>
              <textarea
                id="gh-issue-body"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("dialog.fields.bodyPlaceholder")}
                className={TEXTAREA_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("dialog.fields.labels")}</Label>
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-input bg-muted/30 p-2">
                {labelsQuery.isLoading ? (
                  <span className="text-xs text-muted-foreground">{t("loading")}</span>
                ) : availableLabels.length === 0 ? (
                  <span className="text-xs text-muted-foreground">{t("dialog.noLabels")}</span>
                ) : (
                  availableLabels.map((lbl) => {
                    const active = pickedLabels.includes(lbl.name);
                    return (
                      <button
                        key={lbl.name}
                        type="button"
                        onClick={() => toggleLabel(lbl.name)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium leading-none outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring",
                          active ? "opacity-100 ring-2 ring-foreground/60" : "opacity-60 hover:opacity-90"
                        )}
                        style={{
                          backgroundColor: `#${lbl.color}`,
                          color: labelTextColor(lbl.color),
                        }}
                      >
                        {lbl.name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gh-issue-assignee">{t("dialog.fields.assignee")}</Label>
              <select
                id="gh-issue-assignee"
                value={pickedAssignee}
                onChange={(e) => setPickedAssignee(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <option value="">{t("dialog.fields.unassigned")}</option>
                {collaborators.map((c: GithubAssignee) => (
                  <option key={c.login} value={c.login}>
                    {c.login}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={createMutation.isPending}
                onClick={() => setCreateOpen(false)}
              >
                {t("dialog.cancel")}
              </Button>
              <Button type="submit" size="lg" disabled={createMutation.isPending || !title.trim()}>
                {createMutation.isPending ? t("dialog.saving") : t("dialog.save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

interface IssueRowProps {
  issue: GithubIssueLink;
  canManage: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onRefresh: () => void;
  onToggleState: () => void;
  refreshPending: boolean;
  statePending: boolean;
  t: ReturnType<typeof useTranslations>;
}

function IssueRow({
  issue,
  canManage,
  expanded,
  onToggleExpand,
  onRefresh,
  onToggleState,
  refreshPending,
  statePending,
  t,
}: IssueRowProps) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {issue.state === "open" ? (
            <CircleDot className="size-4 shrink-0 text-success" strokeWidth={1.8} aria-hidden />
          ) : (
            <CircleCheck
              className="size-4 shrink-0 text-muted-foreground"
              strokeWidth={1.8}
              aria-hidden
            />
          )}
          <a
            href={issue.issueUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm font-medium text-foreground hover:underline"
          >
            #{issue.issueNumber} {issue.title}
          </a>
          {issue.labels.map((lbl) => (
            <LabelChip key={lbl.name} label={lbl} />
          ))}
          {issue.assignees.map((a) => (
            <span
              key={a.login}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
              title={a.login}
            >
              {a.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.avatarUrl} alt="" className="size-3.5 rounded-full" />
              ) : null}
              {a.login}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("comments.toggle")}
            aria-expanded={expanded}
            onClick={onToggleExpand}
          >
            <MessageSquare aria-hidden />
          </Button>
          {canManage ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t(issue.state === "open" ? "closeIssue" : "reopenIssue")}
              disabled={statePending}
              onClick={onToggleState}
            >
              {issue.state === "open" ? (
                <CircleCheck aria-hidden />
              ) : (
                <CircleDot aria-hidden />
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("refresh")}
            disabled={refreshPending}
            onClick={onRefresh}
          >
            <RefreshCw aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={<a href={issue.issueUrl} target="_blank" rel="noreferrer" />}
            aria-label={t("openOnGithub")}
          >
            <ExternalLink aria-hidden />
          </Button>
        </div>
      </div>
      {expanded ? <IssueComments issueId={issue.id} canComment={canManage} t={t} /> : null}
    </div>
  );
}

function IssueComments({
  issueId,
  canComment,
  t,
}: {
  issueId: string;
  canComment: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState("");
  const queryKey = ["github-comments", issueId] as const;
  const query = useQuery({ queryKey, queryFn: () => githubApi.listComments(issueId) });

  const addMutation = useMutation({
    mutationFn: () => githubApi.addComment(issueId, draft.trim()),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast({ tone: "destructive", title: t("comments.addFailedToast") }),
  });

  const comments = query.data ?? [];

  return (
    <div className="border-t border-border bg-muted/20 px-3 py-3">
      {query.isLoading ? (
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("comments.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              {c.authorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.authorAvatarUrl} alt="" className="mt-0.5 size-5 shrink-0 rounded-full" />
              ) : null}
              <div className="min-w-0">
                <span className="font-medium text-foreground">{c.author}</span>{" "}
                <span className="whitespace-pre-wrap text-muted-foreground">{c.body}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            addMutation.mutate();
          }}
          className="mt-3 flex items-start gap-2"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={t("comments.addPlaceholder")}
            className={cn(TEXTAREA_CLASS, "flex-1")}
          />
          <Button
            type="submit"
            variant="outline"
            size="icon-sm"
            disabled={addMutation.isPending || !draft.trim()}
            aria-label={t("comments.send")}
          >
            <Send aria-hidden />
          </Button>
        </form>
      ) : null}
    </div>
  );
}
