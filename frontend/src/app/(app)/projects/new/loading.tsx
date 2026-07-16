import { SkeletonCard } from "@/components/shared";

/** Route-level loading for /projects/new. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted/70" />
      </div>
      <SkeletonCard />
    </div>
  );
}
