/** Route-level loading for the conversion wizard. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-10 w-full max-w-md animate-pulse rounded bg-muted" />
      <div className="h-80 w-full max-w-3xl animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
