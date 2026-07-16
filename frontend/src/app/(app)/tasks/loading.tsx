import { SkeletonList } from "@/components/shared";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-muted/70" />
        <div className="h-9 w-56 animate-pulse rounded-lg bg-muted/70" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card/30 p-2">
            <div className="mb-2 h-9 animate-pulse rounded-lg bg-muted/60" />
            <SkeletonList rows={2} media={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
