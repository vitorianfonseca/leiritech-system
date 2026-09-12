import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The LeiriTech mark.
 *
 * An "L" drawn as a set square — a vertical meeting a horizontal at a hard
 * corner. That is the shape of the tool a thing gets built against: structure
 * and squaring-up, which is what an operations system does for a studio.
 *
 * Detached at the end of the horizontal arm sits a single block in the signal
 * colour: the next step, not yet joined. It carries the idea the whole product
 * is organised around — what happens next — and it keeps the app's colour rule
 * intact, because the accent still marks an action and never decoration. The L
 * itself is ink, so the mark reads on paper and on charcoal alike.
 *
 * Built on a 32-unit grid with 5.5-unit strokes so it survives 16px: at
 * favicon size the corner and the gap are still legible.
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
        d="M7.6 5h4.6a.6.6 0 0 1 .6.6v15.3h6.6a.6.6 0 0 1 .6.6v4.6a.6.6 0 0 1-.6.6H7.6a.6.6 0 0 1-.6-.6V5.6a.6.6 0 0 1 .6-.6Z"
        fill="currentColor"
      />
      {/* Ink, not the accent. The mark is the company's, so it stays the same
          whichever theme someone picks — a logo that changes colour with a
          preference is not a logo. `currentColor` rather than a literal black
          so the whole mark still flips on a dark ground; on light it renders
          as the near-black the L uses. */}
      <rect x="23" y="20.9" width="5.8" height="5.8" rx="0.8" fill="currentColor" />
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
      <LeiritechMark className="size-7 shrink-0 text-foreground" />
      {!collapsed && (
        <span className="font-heading text-[1.05rem] font-semibold tracking-tight text-foreground">
          LeiriTech
        </span>
      )}
    </span>
  );
}
