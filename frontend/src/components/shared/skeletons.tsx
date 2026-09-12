import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Composable skeleton primitives shared across loading states. They mirror the
 * shapes of the real content (text, table rows, cards, list rows) so the
 * loading → loaded transition doesn't shift layout.
 */

export interface SkeletonTextProps extends React.ComponentProps<"div"> {
  /** Number of lines to render. */
  lines?: number;
  /** Whether the last line is shortened (natural paragraph look). */
  lastLineShort?: boolean;
}

export function SkeletonText({
  lines = 3,
  lastLineShort = true,
  className,
  ...props
}: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3.5",
            lastLineShort && i === lines - 1 ? "w-2/3" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

export interface SkeletonTableProps extends React.ComponentProps<"div"> {
  rows?: number;
  columns?: number;
  /** Render a header row of slightly stronger blocks. */
  header?: boolean;
}

export function SkeletonTable({
  rows = 6,
  columns = 4,
  header = true,
  className,
  ...props
}: SkeletonTableProps) {
  return (
    <div
      className={cn("w-full overflow-hidden rounded-xl border border-border", className)}
      role="status"
      aria-live="polite"
      {...props}
    >
      {header ? (
        <div
          className="grid gap-4 border-b border-border bg-muted px-4 py-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-3.5 w-2/3" />
          ))}
        </div>
      ) : null}
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid items-center gap-4 px-4 py-3.5"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
          >
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn("h-4", c === 0 ? "w-4/5" : "w-3/5")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface SkeletonCardProps extends React.ComponentProps<"div"> {
  /** Show a circular avatar/media block in the header. */
  media?: boolean;
  lines?: number;
}

export function SkeletonCard({
  media = true,
  lines = 2,
  className,
  ...props
}: SkeletonCardProps) {
  return (
    <div
      className={cn("space-y-4 rounded-xl border border-border bg-card p-4", className)}
      {...props}
    >
      <div className="flex items-center gap-3">
        {media ? <Skeleton className="size-10 rounded-full" /> : null}
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonText lines={lines} />
    </div>
  );
}

export interface SkeletonListProps extends React.ComponentProps<"div"> {
  rows?: number;
  media?: boolean;
}

export function SkeletonList({
  rows = 5,
  media = true,
  className,
  ...props
}: SkeletonListProps) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-live="polite" {...props}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
          {media ? <Skeleton className="size-8 rounded-full" /> : null}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export { Skeleton };
