import { SkeletonCard } from "@/components/shared";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
      <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-muted/60" />
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
