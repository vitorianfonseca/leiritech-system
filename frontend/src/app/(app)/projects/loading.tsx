import { SkeletonTable } from "@/components/shared";

/** Route-level loading for /projects. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted" />
      </div>
      <SkeletonTable rows={8} columns={6} />
    </div>
  );
}
