import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { SkeletonList } from "@/components/shared";

export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-live="polite">
      <div className="space-y-2 pb-2">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="h-5 w-32 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <SkeletonList rows={3} media={false} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
