"use client";

import { useTranslations, useFormatter } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, GitCommitHorizontal, GitPullRequest, Star, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { githubApi } from "@/lib/api/github";

/**
 * What the repository is doing, beside the issues linked to this record.
 *
 * The GitHub tab only ever showed linked issues, which says what someone
 * reported and nothing about whether the work is moving. Commits and open pull
 * requests answer that, and both come from the same PAT and the same error
 * translation as the issue calls.
 *
 * The whole block is optional: when there is no token, no repository or the
 * rate limit is hit, the client returns null and this renders nothing rather
 * than taking the issues down with it.
 */
export function GithubRepoActivity({ repo }: { repo?: string }) {
  const t = useTranslations("shared.githubIssues");
  const format = useFormatter();

  const { data } = useQuery({
    queryKey: ["github-activity", repo ?? "default"],
    queryFn: () => githubApi.getActivity(repo),
    staleTime: 2 * 60 * 1000, // the repo does not change by the second
  });

  if (!data) return null;
  const { repo: info, commits, pulls } = data;

  function ago(iso: string | null) {
    if (!iso) return null;
    return format.relativeTime(new Date(iso), new Date());
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            {t("repoTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <a
            href={info.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-signal hover:underline"
          >
            {info.fullName}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          {info.description ? (
            <p className="text-sm text-muted-foreground">{info.description}</p>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <GitBranch className="size-3.5" aria-hidden />
              {info.defaultBranch}
            </span>
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5" aria-hidden />
              {info.stars} {t("stars")}
            </span>
            <span>
              {info.openIssues} {t("openIssues")}
            </span>
            {info.language ? <span>{info.language}</span> : null}
            {info.pushedAt ? (
              <span>
                {t("lastPush")} {ago(info.pushedAt)}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCommitHorizontal className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            {t("commits")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {commits.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noCommits")}</p>
          ) : (
            <ul className="space-y-2.5">
              {commits.slice(0, 5).map((c) => (
                <li key={c.sha}>
                  <a
                    href={c.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block min-w-0"
                  >
                    <p className="truncate text-sm text-foreground hover:underline">{c.message}</p>
                    <p className="text-xs text-muted-foreground">
                      <code className="font-mono">{c.shortSha}</code>
                      {c.authorLogin || c.authorName ? ` · ${c.authorLogin ?? c.authorName}` : ""}
                      {c.committedAt ? ` · ${ago(c.committedAt)}` : ""}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitPullRequest className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            {t("pulls")}
            {pulls.length > 0 ? <Badge variant="info">{pulls.length}</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pulls.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPulls")}</p>
          ) : (
            <ul className="space-y-2.5">
              {pulls.slice(0, 5).map((pr) => (
                <li key={pr.number}>
                  <a
                    href={pr.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block min-w-0"
                  >
                    <p className="truncate text-sm text-foreground hover:underline">
                      <span className="text-muted-foreground">#{pr.number}</span> {pr.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pr.draft ? `${t("draft")} · ` : ""}
                      {pr.authorLogin ?? ""}
                      {pr.updatedAt ? ` · ${ago(pr.updatedAt)}` : ""}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
