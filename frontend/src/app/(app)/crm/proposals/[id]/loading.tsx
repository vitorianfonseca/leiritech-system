import { SkeletonCard } from "@/components/shared";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <SkeletonCard />
        </div>
        <div className="lg:col-span-2">
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
