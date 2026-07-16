export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card/40" />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-9 w-40 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-border bg-card/40" />
    </div>
  );
}
