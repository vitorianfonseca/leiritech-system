import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Aurea mark — a golden "aura" ring with an inner arc, evoking balance,
 * proportion and light. Uses currentColor / the gold token so it adapts to
 * light and dark. Decorative when paired with the wordmark.
 */
export function AureaMark({
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
      <circle
        cx="16"
        cy="16"
        r="13"
        stroke="var(--gold)"
        strokeWidth="2"
        opacity="0.35"
      />
      <path
        d="M16 4a12 12 0 0 1 10.39 6"
        stroke="var(--gold)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="4.5" fill="var(--gold)" />
    </svg>
  );
}

export function AureaWordmark({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <AureaMark className="size-7 shrink-0" />
      {!collapsed && (
        <span className="font-heading text-[1.05rem] font-semibold tracking-tight text-foreground">
          Aurea<span className="text-muted-foreground font-normal"> System</span>
        </span>
      )}
    </span>
  );
}
