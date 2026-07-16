export default function Loading() {
  return (
    <div
      className="mx-auto max-w-4xl space-y-8"
      role="status"
      aria-live="polite"
    >
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-muted/70" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="size-9 animate-pulse rounded-lg bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-56 animate-pulse rounded-md bg-muted/70" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <div
                key={j}
                className="h-16 animate-pulse rounded-lg bg-muted/50"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
