import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Route-level loading for /projects/[id]. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-32 w-full animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        </div>
        <Card className="lg:col-span-1">
          <CardContent className="pt-6">
            <div className="h-40 w-full animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
