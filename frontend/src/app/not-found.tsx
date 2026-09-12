import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Compass, ArrowRight } from "lucide-react";
import { LeiritechWordmark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";

/**
 * App-level 404 (issue #58). Handles both `notFound()` calls and any unmatched
 * URL across the app. Branded with the LeiriTech mark + design tokens, fully i18n
 * (pt-PT / en resolved server-side — never from the URL), and offers a recovery
 * link back to a safe route.
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <LeiritechWordmark />

        <div className="flex flex-col items-center gap-5">
          <span
            className="flex size-16 items-center justify-center rounded-full bg-signal-muted text-signal"
            aria-hidden
          >
            <Compass className="size-8" strokeWidth={1.5} />
          </span>

          <p className="font-heading text-6xl font-semibold tracking-tight text-signal tabular-nums">
            404
          </p>

          <div className="space-y-2">
            <h1 className="font-heading text-2xl font-semibold text-foreground">
              {t("title")}
            </h1>
            <p className="text-pretty text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
        </div>

        <Button size="lg" nativeButton={false} render={<Link href="/" />}>
          {t("backHome")}
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </main>
  );
}
