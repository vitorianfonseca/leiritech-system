import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * LeiriTech mark — an "L" traced as a circuit path between two connection
 * nodes, evoking signal and structure. Uses the cobalt brand token so it
 * adapts to light and dark. Decorative when paired with the wordmark.
 */
export function LeiritechMark({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-7", className)}
      {...props}
    >
      <path
        d="M10 6v16h14"
        stroke="var(--signal)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="6" r="2.5" fill="var(--signal)" />
      <circle cx="24" cy="22" r="2.5" fill="var(--signal)" />
    </svg>
  );
}

export function LeiritechWordmark({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LeiritechMark className="size-7 shrink-0" />
      {!collapsed && (
        <span className="font-heading text-[1.05rem] font-semibold tracking-tight text-foreground">
          LeiriTech
        </span>
      )}
    </span>
  );
}
