import { SkeletonCard } from "@/components/shared";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="flex items-center gap-4">
        <div className="size-14 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-7 w-56 animate-pulse rounded bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted/70" />
        </div>
      </div>
      <div className="h-10 w-full animate-pulse rounded bg-muted/60" />
      <SkeletonCard />
    </div>
  );
}
