"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { TriangleAlert, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("templates");
  return (
    <div className="space-y-6 py-8">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/settings/templates" />}>
        <ArrowLeft aria-hidden />
        {t("editor.back")}
      </Button>
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
