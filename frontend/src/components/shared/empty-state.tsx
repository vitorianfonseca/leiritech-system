import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.ComponentProps<"div"> {
  /** Decorative icon shown above the title. Defaults to an inbox. */
  icon?: LucideIcon;
  /** Primary message. */
  title: string;
  /** Optional supporting copy. */
  description?: string;
  /** Optional call-to-action (usually a <Button/>). Rendered under the copy. */
  action?: React.ReactNode;
  /** Visual density — `card` adds a bordered surface, `bare` sits inline. */
  variant?: "card" | "bare";
}

/**
 * Icon + title + description + optional CTA. Used by SmartTable and any
 * feature surface that renders a "nothing here yet" state. All copy is passed
 * in already localized by the caller (via next-intl).
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  variant = "card",
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        variant === "card" && "rounded-xl border border-dashed border-border bg-card/40",
        className
      )}
      {...props}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" strokeWidth={1.6} aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-heading text-base font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
