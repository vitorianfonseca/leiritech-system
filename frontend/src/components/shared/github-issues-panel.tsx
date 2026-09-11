"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bug, CircleDot, CircleCheck, ExternalLink, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "./toast";
import { githubApi, GithubIntegrationError, type GithubIssueLink } from "@/lib/api/github";

const TEXTAREA_CLASS =
  "flex w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

export interface GithubIssuesPanelProps {
  /** What this panel's issues are filed about — a project, an audit finding,
   * or any other addressable entity. Scopes both the list and every issue
   * created from here. */
  entityType: string;
  entityId: string;
  /** May the current user file a new issue from here (matrix-style write
   * gate — Gestor+, mirrored from the backend's RequireGestor)? */
  canCreate: boolean;
  /** Pre-filled into the create dialog (e.g. "Bug: <project name> — "). */
  titlePrefix?: string;
  /** Overrides the backend's default repo (e.g. a client's own repo). */
  repo?: string;
  labels?: string[];
}

/**
 * Reusable "GitHub issues filed about this" panel — a list of already-linked
 * issues (with live-refreshable open/closed state) plus a create-issue
 * dialog. Used both on a Project's detail page and in the internal
 * audit-findings area, so every issue filed anywhere in the app goes through
 * the same real GitHub-backed path.
 */
export function GithubIssuesPanel({
  entityType,
  entityId,
  canCreate,
  titlePrefix = "",
  repo,
  labels,
}: GithubIssuesPanelProps) {
  const t = useTranslations("shared.githubIssues");
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(titlePrefix);
  const [body, setBody] = React.useState("");

  const queryKey = ["github-issues", entityType, entityId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => githubApi.listIssues(entityType, entityId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      githubApi.createIssue({ entityType, entityId, title: title.trim(), body, repo, labels }),
    onSuccess: (link) => {
      queryClient.setQueryData<GithubIssueLink[]>(queryKey, (prev) => [link, ...(prev ?? [])]);
      toast({ tone: "success", title: t("createdToast", { number: link.issueNumber }) });
      setOpen(false);
      setTitle(titlePrefix);
      setBody("");
    },
    onError: (err) => {
      const message =
        err instanceof GithubIntegrationError ? err.message : t("createFailedGeneric");
      toast({ tone: "destructive", title: t("createFailedToast"), description: message });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: (linkId: string) => githubApi.refreshIssue(linkId),
    onSuccess: (updated) => {
      queryClient.setQueryData<GithubIssueLink[]>(queryKey, (prev) =>
        (prev ?? []).map((l) => (l.id === updated.id ? updated : l))
      );
    },
    onError: () => {
      toast({ tone: "destructive", title: t("refreshFailedToast") });
    },
  });

  const issues = query.data ?? [];

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canCreate ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Bug aria-hidden />
            {t("createButton")}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          issues.map((issue) => (
            <div
              key={issue.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
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
                <Badge variant={issue.state === "open" ? "success" : "default"}>
                  {t(`state.${issue.state}`)}
                </Badge>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("refresh")}
                  disabled={refreshMutation.isPending}
                  onClick={() => refreshMutation.mutate(issue.id)}
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
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={(next) => (!createMutation.isPending ? setOpen(next) : null)}>
        <DialogContent className="max-w-lg p-6">
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
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("dialog.fields.bodyPlaceholder")}
                className={TEXTAREA_CLASS}
              />
            </div>
            <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={createMutation.isPending}
                onClick={() => setOpen(false)}
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
