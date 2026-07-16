import { SkeletonTable } from "@/components/shared";

export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-live="polite">
      <div className="space-y-2 pb-2">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted/70" />
      </div>
      <SkeletonTable rows={6} columns={6} />
    </div>
  );
}
