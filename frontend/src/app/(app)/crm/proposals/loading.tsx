import { SkeletonTable } from "@/components/shared";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-muted/70" />
        </div>
        <div className="h-9 w-36 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-9 w-full max-w-xs animate-pulse rounded-md bg-muted" />
      <SkeletonTable rows={8} columns={6} />
    </div>
  );
}
