"use client";

import { useTranslations } from "next-intl";
import { TriangleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("finance");
  return (
    <div className="py-8">
      <EmptyState
        icon={TriangleAlert}
        title={t("errors.loadTitle")}
        description={t("errors.loadDescription")}
        action={
          <Button variant="outline" size="lg" onClick={reset}>
            <RefreshCw aria-hidden />
            {t("errors.retry")}
          </Button>
        }
      />
    </div>
  );
}
