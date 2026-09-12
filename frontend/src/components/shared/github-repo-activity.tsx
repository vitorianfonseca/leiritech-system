"use client";

import { useTranslations, useFormatter } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import {
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Star,
  CircleDot,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { githubApi } from "@/lib/api/github";

/**
 * What the repository is doing, beside the issues linked to this record.
 *
 * Everything here used to be one weight and one colour, which made a card of
 * facts read as a paragraph. The hierarchy is now carried by three things and
 * not by size alone: the thing you scan for is foreground and medium, what
 * qualifies it is muted and smaller, and identifiers are mono so a SHA never
 * gets mistaken for prose. Rows are separated by rules rather than by gaps,
 * so a list of five commits reads as five things.
 *
 * The whole block is optional: with no token, no repository or a rate limit
 * hit, the client returns null and this renders nothing rather than taking
 * the issues below down with it.
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
      <Card className="h-full gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-wide text-muted-foreground uppercase">
            <GitBranch className="size-3.5" strokeWidth={2} aria-hidden />
            {t("repoTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <a
              href={info.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-heading inline-flex items-baseline gap-1.5 text-lg font-semibold tracking-tight text-foreground hover:text-signal"
            >
              {info.name}
              <ExternalLink className="size-3.5 shrink-0 self-center text-muted-foreground" aria-hidden />
            </a>
            {info.description ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{info.description}</p>
            ) : null}
          </div>

          {/* Figures, not a sentence: the number leads and the word explains it. */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
            <div>
              <dt className="text-xs text-muted-foreground">{t("openIssues")}</dt>
              <dd className="font-heading text-base font-semibold tabular-nums text-foreground">
                {info.openIssues}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("stars")}</dt>
              <dd className="font-heading flex items-center gap-1 text-base font-semibold tabular-nums text-foreground">
                <Star className="size-3.5 text-muted-foreground" aria-hidden />
                {info.stars}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t("branch")}</dt>
              <dd className="truncate font-mono text-sm text-foreground">{info.defaultBranch}</dd>
            </div>
            {info.language ? (
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t("language")}</dt>
                <dd className="truncate text-sm text-foreground">{info.language}</dd>
              </div>
            ) : null}
          </dl>

          {info.pushedAt ? (
            <p className="text-xs text-muted-foreground">
              {t("lastPush")} <span className="text-foreground">{ago(info.pushedAt)}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="h-full gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-wide text-muted-foreground uppercase">
            <GitCommitHorizontal className="size-3.5" strokeWidth={2} aria-hidden />
            {t("commits")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {commits.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noCommits")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {commits.slice(0, 5).map((c) => (
                <li key={c.sha} className="py-2.5 first:pt-0 last:pb-0">
                  <a href={c.htmlUrl} target="_blank" rel="noopener noreferrer" className="flex gap-2.5">
                    {c.authorAvatarUrl ? (
                      <Image
                        src={c.authorAvatarUrl}
                        alt=""
                        width={20}
                        height={20}
                        unoptimized
                        className="mt-0.5 size-5 shrink-0 rounded-full"
                      />
                    ) : (
                      <span className="mt-0.5 size-5 shrink-0 rounded-full bg-muted" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground hover:underline">
                        {c.message}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <code className="glass-chip rounded px-1 py-px font-mono text-[0.6875rem] text-foreground">
                          {c.shortSha}
                        </code>
                        {c.authorLogin ?? c.authorName}
                        {c.committedAt ? <span aria-hidden>· {ago(c.committedAt)}</span> : null}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="h-full gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-wide text-muted-foreground uppercase">
            <GitPullRequest className="size-3.5" strokeWidth={2} aria-hidden />
            {t("pulls")}
            {pulls.length > 0 ? <Badge variant="info">{pulls.length}</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pulls.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPulls")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {pulls.slice(0, 5).map((pr) => (
                <li key={pr.number} className="py-2.5 first:pt-0 last:pb-0">
                  <a href={pr.htmlUrl} target="_blank" rel="noopener noreferrer" className="flex gap-2.5">
                    <CircleDot
                      className="mt-0.5 size-4 shrink-0 text-success"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground hover:underline">
                        {pr.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <code className="font-mono text-[0.6875rem]">#{pr.number}</code>
                        {pr.draft ? <Badge variant="outline">{t("draft")}</Badge> : null}
                        {pr.authorLogin}
                        {pr.updatedAt ? <span aria-hidden>· {ago(pr.updatedAt)}</span> : null}
                      </span>
                    </span>
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
