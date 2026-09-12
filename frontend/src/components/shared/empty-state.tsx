import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export type EmptyStateTone = "neutral" | "positive" | "warning" | "danger";

export interface EmptyStateProps extends React.ComponentProps<"div"> {
  /** Decorative icon shown inside the mark. Defaults to an inbox. */
  icon?: LucideIcon;
  /** Primary message. */
  title: string;
  /** Optional supporting copy. */
  description?: string;
  /** Optional call-to-action (usually a <Button/>). Rendered under the copy. */
  action?: React.ReactNode;
  /** Visual density — `card` adds a bordered surface, `bare` sits inline. */
  variant?: "card" | "bare";
  /**
   * What the emptiness means. "Nothing overdue" is good news and "no results"
   * is not; a single grey treatment said both in the same voice.
   */
  tone?: EmptyStateTone;
  /** Replaces the mark entirely, for surfaces that have their own artwork. */
  illustration?: React.ReactNode;
}

/**
 * The mark above an empty state.
 *
 * A 12px grey circle around a grey icon is what every component library ships
 * and it reads as an absence of design rather than an absence of data. This
 * builds a small piece of artwork instead: two soft blobs in the refracted
 * pastels the glass material already uses, offset behind a translucent disc
 * with the icon on top. It costs one SVG-free element, scales with the tone,
 * and gives sixty-odd empty surfaces something to look at.
 */
const TONE: Record<EmptyStateTone, { blobA: string; blobB: string; icon: string }> = {
  neutral: {
    blobA: "bg-[rgb(var(--refract-cyan))]",
    blobB: "bg-[rgb(var(--refract-lavender))]",
    icon: "text-signal",
  },
  positive: {
    blobA: "bg-[oklch(0.88_0.10_155)]",
    blobB: "bg-[rgb(var(--refract-cyan))]",
    icon: "text-success",
  },
  warning: {
    blobA: "bg-[rgb(var(--refract-peach))]",
    blobB: "bg-[rgb(var(--refract-pink))]",
    icon: "text-health-attention",
  },
  danger: {
    blobA: "bg-[rgb(var(--refract-pink))]",
    blobB: "bg-[rgb(var(--refract-peach))]",
    icon: "text-status-overdue",
  },
};

function EmptyMark({ icon: Icon, tone }: { icon: LucideIcon; tone: EmptyStateTone }) {
  const c = TONE[tone];
  return (
    <div className="relative size-20" aria-hidden>
      {/* Offset blobs, blurred: the colour reads as light behind the mark
          rather than as a filled shape competing with the icon. */}
      <span className={cn("absolute left-1 top-2 size-12 rounded-full blur-xl opacity-70", c.blobA)} />
      <span className={cn("absolute right-1 bottom-1 size-12 rounded-full blur-xl opacity-60", c.blobB)} />
      <span className="glass absolute inset-2 flex items-center justify-center rounded-2xl">
        <Icon className={cn("size-7", c.icon)} strokeWidth={1.6} />
      </span>
    </div>
  );
}

/**
 * Illustration + title + description + optional CTA. Used by SmartTable and any
 * feature surface that renders a "nothing here yet" state. All copy is passed
 * in already localized by the caller (via next-intl).
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  variant = "card",
  tone = "neutral",
  illustration,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-6 py-12 text-center",
        variant === "card" && "rounded-2xl border border-dashed border-border bg-card",
        className
      )}
      {...props}
    >
      {illustration ?? <EmptyMark icon={Icon} tone={tone} />}
      <div className="space-y-1.5">
        <p className="font-heading text-lg font-semibold tracking-tight text-balance text-foreground">
          {title}
        </p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
