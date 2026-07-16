"use client";

import { useTranslations } from "next-intl";
import { TriangleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";

/** Route-level error boundary for /projects/[id]. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("projects.detail");
  return (
    <div className="py-8">
      <EmptyState
        icon={TriangleAlert}
        title={t("errorTitle")}
        description={t("errorDescription")}
        action={
          <Button variant="outline" size="lg" onClick={reset}>
            <RefreshCw aria-hidden />
            {t("retry")}
          </Button>
        }
      />
    </div>
  );
}
