"use client";

import { useTranslations } from "next-intl";
import { TriangleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("team.errors");
  return (
    <div className="py-8">
      <EmptyState
        icon={TriangleAlert}
        title={t("loadTitle")}
        description={t("loadDescription")}
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
