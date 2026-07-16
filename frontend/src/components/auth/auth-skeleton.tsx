import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholder mirroring the auth card layout (header + two fields +
 * submit) so the transition into any auth route has no layout shift.
 */
export function AuthSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <Card className="shadow-md" aria-hidden="true">
      <CardHeader className="items-center gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}
