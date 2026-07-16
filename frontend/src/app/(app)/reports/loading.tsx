import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-live="polite">
      <div className="space-y-2 pb-2">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded-md bg-muted/70" />
      </div>

      {/* Tabs + filter bar */}
      <div className="h-11 w-full max-w-md animate-pulse rounded-xl bg-muted" />
      <div className="h-24 w-full animate-pulse rounded-xl bg-muted/60" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-5 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-56 animate-pulse rounded bg-muted/70" />
            </CardHeader>
            <CardContent>
              <div className="h-52 w-full animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
