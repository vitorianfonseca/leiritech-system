import { SkeletonList } from "@/components/shared";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="space-y-2 pb-2">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <SkeletonList rows={6} media={false} />
      </div>
    </div>
  );
}
