import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Route-level loading for the `(app)` index (dashboard). Child routes with their
 * own `loading.tsx` (finance, my-work, calendar, settings) take precedence; this
 * only covers the dashboard and any future child without its own fallback.
 */
export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-live="polite">
      {/* Header */}
      <div className="space-y-2 pb-2">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded-md bg-muted" />
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="gap-3 p-5">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
              <div className="size-8 animate-pulse rounded-lg bg-muted" />
            </div>
            <div className="h-8 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </Card>
        ))}
      </div>

      {/* Attention + health */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 w-full animate-pulse rounded-lg bg-muted" />
            ))}
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

      {/* Chart */}
      <Card>
        <CardHeader>
          <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="h-56 w-full animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    </div>
  );
}
