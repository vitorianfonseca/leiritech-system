import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SkeletonTable } from "@/components/shared";

export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-live="polite">
      <div className="space-y-2 pb-2">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded-md bg-muted/70" />
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="gap-3 p-5">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-28 animate-pulse rounded bg-muted/70" />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <SkeletonTable rows={6} columns={5} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
