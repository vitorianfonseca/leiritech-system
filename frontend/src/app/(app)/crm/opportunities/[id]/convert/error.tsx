"use client";

import { useTranslations } from "next-intl";
import { TriangleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";

/** Route-level error boundary for the conversion wizard. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("conversion.guard");
  return (
    <div className="py-8">
      <EmptyState
        icon={TriangleAlert}
        title={t("genericTitle")}
        description={t("genericDescription")}
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
