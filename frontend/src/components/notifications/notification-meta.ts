import type { LucideIcon } from "lucide-react";
import {
  ListChecks,
  Wallet,
  GitBranch,
  FileText,
  FolderKanban,
  CalendarDays,
  UsersRound,
  AtSign,
  MessageSquare,
  Bell,
} from "lucide-react";
import type {
  NotificationCategory,
  NotificationType,
} from "@/lib/api/notifications-types";

/** Icon per category — the primary visual differentiator between kinds. */
export const CATEGORY_ICON: Record<NotificationCategory, LucideIcon> = {
  task: ListChecks,
  payment: Wallet,
  opportunity: GitBranch,
  proposal: FileText,
  project: FolderKanban,
  meeting: CalendarDays,
  workload: UsersRound,
  mention: AtSign,
  comment: MessageSquare,
  system: Bell,
};

/**
 * Urgency tone. Kept to three levels so the feed reads at a glance without a
 * rainbow of accents (DESIGN.md restraint): `urgent` = red alarm zone,
 * `attention` = amber, `neutral` = stone. Only the types that genuinely carry
 * urgency are elevated.
 */
export type NotificationTone = "urgent" | "attention" | "neutral";

const URGENT: ReadonlySet<NotificationType> = new Set([
  "task_overdue",
  "payment_overdue",
  "proposal_expired",
  "health_downgrade",
]);

const ATTENTION: ReadonlySet<NotificationType> = new Set([
  "milestone_due_soon",
  "payment_due_soon",
  "stale_opportunity",
  "workload_overallocated",
  "forgotten_timer",
  "won_not_converted",
  "phase_completion_suggested",
  "task_returned",
]);

export function toneForType(type: NotificationType): NotificationTone {
  if (URGENT.has(type)) return "urgent";
  if (ATTENTION.has(type)) return "attention";
  return "neutral";
}

/** Badge variant for the category chip, tinted by urgency tone. */
export function badgeVariantForTone(
  tone: NotificationTone
): "destructive" | "due" | "outline" {
  if (tone === "urgent") return "destructive";
  if (tone === "attention") return "due";
  return "outline";
}
