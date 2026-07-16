"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { format, parseISO } from "date-fns";
import {
  MapPin,
  AtSign,
  CheckCheck,
  FolderKanban,
  Timer,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { ProgressBar } from "@/components/shared";
import type { VariantProps } from "class-variance-authority";
import type {
  MyMeeting,
  MyMention,
  MyProject,
  MyReviewRequest,
  MyTimeEntry,
  ProjectHealth,
} from "@/lib/api/my-work-types";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

type ProgressTone = "success" | "warning" | "destructive";

const HEALTH_META: Record<ProjectHealth, { variant: BadgeVariant; tone: ProgressTone }> = {
  healthy: { variant: "healthy", tone: "success" },
  attention: { variant: "attention", tone: "warning" },
  at_risk: { variant: "atRisk", tone: "destructive" },
};

function rowBase(interactive: boolean): string {
  return cn(
    "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left",
    interactive && "w-full transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  );
}

function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
      {children}
    </span>
  );
}

export function MeetingRow({ meeting }: { meeting: MyMeeting }) {
  return (
    <div className={rowBase(false)}>
      <span className="flex flex-col items-center rounded-lg bg-gold-muted px-2.5 py-1 text-gold">
        <span className="font-heading text-sm font-semibold tabular-nums leading-none">
          {format(parseISO(meeting.startsAt), "HH:mm")}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{meeting.title}</p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          {meeting.location ? (
            <>
              <MapPin className="size-3" strokeWidth={1.8} aria-hidden />
              {meeting.location}
            </>
          ) : null}
          <span aria-hidden>·</span>
          {format(parseISO(meeting.startsAt), "HH:mm")}–
          {format(parseISO(meeting.endsAt), "HH:mm")}
        </p>
      </div>
    </div>
  );
}

export function MentionRow({
  mention,
  onOpen,
}: {
  mention: MyMention;
  onOpen: (mention: MyMention) => void;
}) {
  return (
    <button type="button" onClick={() => onOpen(mention)} className={rowBase(true)}>
      <IconBadge>
        <AtSign className="size-[18px]" strokeWidth={1.8} aria-hidden />
      </IconBadge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-medium">{mention.authorName}</span>{" "}
          <span className="text-muted-foreground">— {mention.entityLabel}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">{mention.excerpt}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
    </button>
  );
}

export function ReviewRow({
  review,
  onApprove,
  onOpen,
}: {
  review: MyReviewRequest;
  onApprove: (review: MyReviewRequest) => void;
  onOpen: (review: MyReviewRequest) => void;
}) {
  const t = useTranslations("myWork");
  return (
    <div className={rowBase(false)}>
      <IconBadge>
        <CheckCheck className="size-[18px]" strokeWidth={1.8} aria-hidden />
      </IconBadge>
      <button
        type="button"
        onClick={() => onOpen(review)}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:underline"
      >
        <p className="truncate text-sm font-medium hover:text-gold">{review.taskTitle}</p>
        <p className="truncate text-xs text-muted-foreground">
          {review.projectName} · {review.requestedByName}
        </p>
      </button>
      <Button variant="outline" size="sm" onClick={() => onApprove(review)}>
        <CheckCheck aria-hidden />
        {t("actions.approve")}
      </Button>
    </div>
  );
}

export function ProjectRow({
  project,
  onOpen,
}: {
  project: MyProject;
  onOpen: (project: MyProject) => void;
}) {
  const t = useTranslations("myWork");
  const meta = HEALTH_META[project.health];
  return (
    <button type="button" onClick={() => onOpen(project)} className={rowBase(true)}>
      <IconBadge>
        <FolderKanban className="size-[18px]" strokeWidth={1.8} aria-hidden />
      </IconBadge>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{project.name}</p>
          <Badge variant={meta.variant}>{t(`health.${project.health}`)}</Badge>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <ProgressBar
            value={project.progress}
            tone={meta.tone}
            size="sm"
            aria-label={t("projectProgressLabel", { name: project.name })}
            className="flex-1"
          />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {project.progress}%
          </span>
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
    </button>
  );
}

export function TimeEntryRow({ entry }: { entry: MyTimeEntry }) {
  return (
    <div className={rowBase(false)}>
      <IconBadge>
        <Timer className="size-[18px]" strokeWidth={1.8} aria-hidden />
      </IconBadge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.taskTitle}</p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.projectName} · {format(parseISO(entry.date), "dd/MM")}
        </p>
      </div>
      <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground">
        {formatDuration(entry.durationMs)}
      </span>
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
